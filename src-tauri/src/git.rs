use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncReadExt};

// ── 辅助函数 ─────────────────────────────────────────────────────────────────

/// Validate that project_path is absolute and looks like a real project directory.
fn validate_project_path(project_path: &str) -> Result<(), String> {
    let path = Path::new(project_path);
    if !path.is_absolute() {
        return Err("Project path must be absolute".to_string());
    }
    if !path.exists() {
        return Err("Project path does not exist".to_string());
    }
    // Resolve symlinks / .. and ensure the path didn't escape
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Cannot resolve project path: {}", e))?;
    if canonical != path {
        // Allow symlinks that resolve to a valid directory, but block obvious traversal
        if !canonical.is_dir() {
            return Err("Project path is not a directory".to_string());
        }
    }
    Ok(())
}

/// 执行 git 命令并返回原始 Output。
/// 泛型 S 允许同时接受 `&[&str]` 和 `&[String]`。
fn run_git<S: AsRef<std::ffi::OsStr>>(
    project_path: &str,
    args: &[S],
) -> Result<std::process::Output, String> {
    validate_project_path(project_path)?;

    let mut cmd = std::process::Command::new("git");
    crate::subprocess::configure_background_command(&mut cmd);
    cmd.args(args)
        .current_dir(project_path)
        .output()
        .map_err(|e| e.to_string())
}

async fn read_pipe_to_end<R: AsyncRead + Unpin>(
    mut pipe: R,
    stream_name: &str,
) -> Result<Vec<u8>, String> {
    let mut data = Vec::new();
    pipe.read_to_end(&mut data)
        .await
        .map_err(|e| format!("Failed to read git {}: {}", stream_name, e))?;
    Ok(data)
}

/// 带超时的 git 命令执行。
/// 超时后会终止底层 git 子进程，避免后台进程和阻塞线程持续积压。
async fn run_git_with_timeout(
    project_path: String,
    args: Vec<String>,
    timeout: Duration,
) -> Result<Output, String> {
    validate_project_path(&project_path)?;

    let mut cmd = tokio::process::Command::new("git");
    crate::subprocess::configure_background_tokio_command(&mut cmd);
    let mut child = cmd
        .args(&args)
        .current_dir(&project_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture git stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture git stderr".to_string())?;

    let stdout_task = tokio::spawn(read_pipe_to_end(stdout, "stdout"));
    let stderr_task = tokio::spawn(read_pipe_to_end(stderr, "stderr"));

    let status = match tokio::time::timeout(timeout, child.wait()).await {
        Ok(result) => result.map_err(|e| e.to_string())?,
        Err(_) => {
            let _ = child.start_kill();
            let _ = tokio::time::timeout(Duration::from_secs(1), child.wait()).await;
            stdout_task.abort();
            stderr_task.abort();
            let _ = stdout_task.await;
            let _ = stderr_task.await;
            return Err(format!("Git 命令执行超时（{}秒）", timeout.as_secs()));
        }
    };

    let stdout = stdout_task
        .await
        .map_err(|e| format!("Git stdout task failed: {}", e))??;
    let stderr = stderr_task
        .await
        .map_err(|e| format!("Git stderr task failed: {}", e))??;

    Ok(Output { status, stdout, stderr })
}

/// 执行 git 命令，若退出码非零则将 stderr 作为错误返回。
fn run_git_check<S: AsRef<std::ffi::OsStr>>(
    project_path: &str,
    args: &[S],
) -> Result<(), String> {
    let output = run_git(project_path, args)?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(())
}

fn apply_login_shell_env(cmd: &mut Command) {
    for (key, value) in crate::app_settings::get_login_shell_env() {
        cmd.env(key, value);
    }
}

fn run_agent_commit_message_command(
    agent: &str,
    project_path: &str,
    prompt: &str,
) -> Result<Output, String> {
    let launch = crate::app_settings::get_agent_launch_spec(agent);
    let mut cmd = Command::new(&launch.program);
    crate::subprocess::configure_background_command(&mut cmd);
    if agent == "codex" {
        cmd.args(["exec", prompt]);
    } else {
        cmd.args(["-p", prompt, "--output-format", "text"]);
    }
    cmd.current_dir(project_path);
    cmd.stdin(Stdio::null());
    apply_login_shell_env(&mut cmd);
    for (key, value) in &launch.extra_env {
        cmd.env(key, value);
    }
    cmd.output()
        .map_err(|e| format!("Failed to run {agent}: {e}"))
}

fn create_empty_temp_file() -> Result<PathBuf, String> {
    let path = std::env::temp_dir().join(format!("nezha-empty-{}.tmp", uuid::Uuid::new_v4()));
    std::fs::File::create(&path)
        .map_err(|e| format!("Failed to create temporary file for git diff: {e}"))?;
    Ok(path)
}

// ── Tauri 命令 ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn generate_commit_message(project_path: String) -> Result<String, String> {
    // 1. Get staged diff
    let diff_output = run_git(&project_path, &["diff", "--staged"])?;
    let diff = String::from_utf8_lossy(&diff_output.stdout).into_owned();
    if diff.trim().is_empty() {
        return Err("No staged changes to generate a commit message for.".to_string());
    }

    // Truncate diff if too large to avoid CLI arg limits
    let diff = if diff.len() > 50_000 {
        format!("{}...(diff truncated)", &diff[..50_000])
    } else {
        diff
    };

    // 2. Read project config for prompt and default agent
    let config = crate::config::read_project_config(project_path.clone())?;
    let commit_prompt = config.git.commit_prompt;
    let agent = config.agent.default;

    // 3. Build full prompt
    let full_prompt = format!(
        "{}\n\nGit diff:\n```diff\n{}\n```\n\nOutput only the commit message, nothing else.",
        commit_prompt, diff
    );

    // 4. Run agent in non-interactive exec mode with 15 second timeout
    let output = tokio::time::timeout(
        Duration::from_secs(15),
        tokio::task::spawn_blocking(move || {
            run_agent_commit_message_command(&agent, &project_path, &full_prompt)
        }),
    )
    .await
    .map_err(|_| "生成提交信息超时（15秒）".to_string())?
    .map_err(|e| format!("生成提交信息线程错误: {}", e))??;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("Agent failed: {}{}", stderr, stdout));
    }

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if result.is_empty() {
        return Err("Agent returned empty response.".to_string());
    }
    Ok(result)
}

#[derive(serde::Serialize)]
pub(crate) struct GitFileChange {
    path: String,
    status: String,
    staged: bool,
}

#[tauri::command]
pub async fn git_status(project_path: String) -> Result<Vec<GitFileChange>, String> {
    let args = vec![
        "-c".to_string(),
        "core.quotePath=false".to_string(),
        "status".to_string(),
        "--porcelain=v1".to_string(),
    ];
    let output = run_git_with_timeout(project_path, args, Duration::from_secs(5)).await?;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let mut changes = Vec::new();

    for line in stdout.lines() {
        if line.len() < 3 {
            continue;
        }
        let x = &line[0..1];
        let y = &line[1..2];
        let raw_path = line[3..].to_string();
        let display_path = if raw_path.contains(" -> ") {
            raw_path.split(" -> ").last().unwrap_or(&raw_path).to_string()
        } else {
            raw_path
        };

        if x == "?" && y == "?" {
            changes.push(GitFileChange {
                path: display_path,
                status: "?".to_string(),
                staged: false,
            });
        } else {
            if x != " " && x != "?" {
                changes.push(GitFileChange {
                    path: display_path.clone(),
                    status: x.to_string(),
                    staged: true,
                });
            }
            if y != " " && y != "?" {
                changes.push(GitFileChange {
                    path: display_path,
                    status: y.to_string(),
                    staged: false,
                });
            }
        }
    }
    Ok(changes)
}

#[derive(serde::Serialize, Clone)]
pub(crate) struct GitCommit {
    hash: String,
    short_hash: String,
    author: String,
    date: String,
    message: String,
    refs: Vec<String>,
}

#[derive(serde::Serialize)]
pub(crate) struct GitBranchInfo {
    name: String,
    current: bool,
    remote: Option<String>,
}

#[tauri::command]
pub async fn git_list_branches(project_path: String) -> Result<Vec<GitBranchInfo>, String> {
    let output = run_git_with_timeout(
        project_path,
        vec!["branch".to_string(), "-a".to_string()],
        Duration::from_secs(5),
    )
    .await?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let mut branches = Vec::new();
    for line in stdout.lines() {
        if line.len() < 2 {
            continue;
        }
        let current = line.starts_with("* ");
        let raw = line[2..].trim();
        // Skip HEAD pointer lines like "remotes/origin/HEAD -> origin/main"
        if raw.contains(" -> ") {
            continue;
        }
        if let Some(without_remotes) = raw.strip_prefix("remotes/") {
            // "origin/main" -> remote = "origin", name = "origin/main"
            let name = without_remotes.to_string();
            let remote = name.split('/').next().map(|s| s.to_string());
            branches.push(GitBranchInfo { name, current, remote });
        } else if !raw.is_empty() {
            branches.push(GitBranchInfo { name: raw.to_string(), current, remote: None });
        }
    }
    Ok(branches)
}

#[tauri::command]
pub async fn git_checkout_branch(
    project_path: String,
    branch_name: String,
    is_remote: bool,
) -> Result<(), String> {
    let args: Vec<String> = if is_remote {
        // "origin/main" -> local name "main", track remote
        let local_name = branch_name
            .split_once('/')
            .map(|(_, n)| n.to_string())
            .unwrap_or_else(|| branch_name.clone());
        vec![
            "checkout".into(),
            "-b".into(),
            local_name,
            "--track".into(),
            format!("remotes/{}", branch_name),
        ]
    } else {
        vec!["checkout".into(), branch_name.clone()]
    };
    run_git_check(&project_path, &args)
}

#[tauri::command]
pub async fn git_create_branch(
    project_path: String,
    branch_name: String,
    from_branch: String,
) -> Result<(), String> {
    run_git_check(&project_path, &["checkout", "-b", &branch_name, &from_branch])
}

#[tauri::command]
pub async fn git_log(
    project_path: String,
    limit: u32,
    search: Option<String>,
    branch: Option<String>,
) -> Result<Vec<GitCommit>, String> {
    let limit_str = limit.to_string();
    let format = "COMMIT:%H%nSHORT:%h%nAUTHOR:%an%nDATE:%ar%nSUBJECT:%s%nREFS:%D%nEND_RECORD";
    let mut args: Vec<String> =
        vec!["log".into(), format!("--format={}", format), "-n".into(), limit_str];
    if let Some(ref s) = search {
        if !s.is_empty() {
            args.push(format!("--grep={}", s));
        }
    }
    if let Some(ref b) = branch {
        if !b.is_empty() {
            args.push(b.clone());
        }
    }

    let output = run_git_with_timeout(project_path, args, Duration::from_secs(10)).await?;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let mut commits = Vec::new();
    let mut hash = String::new();
    let mut short_hash = String::new();
    let mut author = String::new();
    let mut date = String::new();
    let mut message = String::new();
    let mut refs: Vec<String> = Vec::new();

    for line in stdout.lines() {
        if let Some(v) = line.strip_prefix("COMMIT:") {
            hash = v.to_string();
        } else if let Some(v) = line.strip_prefix("SHORT:") {
            short_hash = v.to_string();
        } else if let Some(v) = line.strip_prefix("AUTHOR:") {
            author = v.to_string();
        } else if let Some(v) = line.strip_prefix("DATE:") {
            date = v.to_string();
        } else if let Some(v) = line.strip_prefix("SUBJECT:") {
            message = v.to_string();
        } else if let Some(v) = line.strip_prefix("REFS:") {
            refs = v
                .split(", ")
                .filter(|s| !s.is_empty())
                .map(|s| s.trim().to_string())
                .collect();
        } else if line == "END_RECORD" && !hash.is_empty() {
            commits.push(GitCommit {
                hash: hash.clone(),
                short_hash: short_hash.clone(),
                author: author.clone(),
                date: date.clone(),
                message: message.clone(),
                refs: refs.clone(),
            });
            hash.clear();
            short_hash.clear();
            author.clear();
            date.clear();
            message.clear();
            refs.clear();
        }
    }
    Ok(commits)
}

#[derive(serde::Serialize)]
pub(crate) struct GitCommitFile {
    path: String,
    status: String,
    additions: i32,
    deletions: i32,
}

#[derive(serde::Serialize)]
pub(crate) struct GitCommitDetail {
    hash: String,
    short_hash: String,
    author: String,
    date: String,
    message: String,
    files: Vec<GitCommitFile>,
    total_additions: i32,
    total_deletions: i32,
}

#[tauri::command]
pub async fn git_commit_detail(
    project_path: String,
    commit_hash: String,
) -> Result<GitCommitDetail, String> {
    let info_out = run_git(
        &project_path,
        &[
            "show",
            "--no-patch",
            "--format=HASH:%H%nSHORT:%h%nAUTHOR:%an%nDATE:%ar%nSUBJECT:%s",
            &commit_hash,
        ],
    )?;

    let info_str = String::from_utf8_lossy(&info_out.stdout).into_owned();
    let mut hash = String::new();
    let mut short_hash = String::new();
    let mut author = String::new();
    let mut date = String::new();
    let mut message = String::new();
    for line in info_str.lines() {
        if let Some(v) = line.strip_prefix("HASH:") {
            hash = v.to_string();
        } else if let Some(v) = line.strip_prefix("SHORT:") {
            short_hash = v.to_string();
        } else if let Some(v) = line.strip_prefix("AUTHOR:") {
            author = v.to_string();
        } else if let Some(v) = line.strip_prefix("DATE:") {
            date = v.to_string();
        } else if let Some(v) = line.strip_prefix("SUBJECT:") {
            message = v.to_string();
        }
    }

    let ns_out = run_git(
        &project_path,
        &["diff-tree", "--no-commit-id", "-r", "--name-status", &commit_hash],
    )?;

    let mut file_statuses: HashMap<String, String> = HashMap::new();
    for line in String::from_utf8_lossy(&ns_out.stdout).lines() {
        let parts: Vec<&str> = line.splitn(3, '\t').collect();
        match parts.as_slice() {
            [st, path] => {
                file_statuses.insert(
                    path.to_string(),
                    if st.starts_with('R') { "R".to_string() } else { st.to_string() },
                );
            }
            [st, _old, new_path] => {
                file_statuses.insert(
                    new_path.to_string(),
                    if st.starts_with('R') { "R".to_string() } else { st.to_string() },
                );
            }
            _ => {}
        }
    }

    let num_out = run_git(
        &project_path,
        &["diff-tree", "--no-commit-id", "-r", "--numstat", &commit_hash],
    )?;

    let mut files = Vec::new();
    let mut total_additions = 0i32;
    let mut total_deletions = 0i32;

    for line in String::from_utf8_lossy(&num_out.stdout).lines() {
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.splitn(3, '\t').collect();
        if parts.len() == 3 {
            let additions: i32 = parts[0].parse().unwrap_or(0);
            let deletions: i32 = parts[1].parse().unwrap_or(0);
            let path = parts[2].to_string();
            total_additions += additions;
            total_deletions += deletions;
            let status =
                file_statuses.get(&path).cloned().unwrap_or_else(|| "M".to_string());
            files.push(GitCommitFile { path, status, additions, deletions });
        }
    }

    Ok(GitCommitDetail {
        hash,
        short_hash,
        author,
        date,
        message,
        files,
        total_additions,
        total_deletions,
    })
}

#[tauri::command]
pub async fn git_show_diff(
    project_path: String,
    commit_hash: String,
) -> Result<String, String> {
    let args = vec!["show".to_string(), "--format=".to_string(), commit_hash];
    let output = run_git_with_timeout(project_path, args, Duration::from_secs(10)).await?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    let raw = output.stdout;
    let limit = 500 * 1024;
    Ok(String::from_utf8_lossy(if raw.len() > limit { &raw[..limit] } else { &raw })
        .into_owned())
}

#[tauri::command]
pub async fn git_file_diff(
    project_path: String,
    file_path: String,
    staged: bool,
) -> Result<String, String> {
    let mut args = vec!["diff".to_string()];
    if staged {
        args.push("--cached".to_string());
    }
    args.push("--".to_string());
    args.push(file_path.clone());

    let output = run_git_with_timeout(project_path.clone(), args, Duration::from_secs(10)).await?;
    let raw = output.stdout;

    // For untracked files, git diff returns nothing — fall back to --no-index diff
    if raw.is_empty() && !staged {
        let abs_path = std::path::Path::new(&project_path).join(&file_path);
        let abs_path_str = abs_path.to_string_lossy().into_owned();
        let empty_file = create_empty_temp_file()?;
        let fallback_args = vec![
            "diff".to_string(),
            "--no-index".to_string(),
            empty_file.to_string_lossy().into_owned(),
            abs_path_str,
        ];
        let fallback =
            run_git_with_timeout(project_path, fallback_args, Duration::from_secs(10)).await;
        let _ = std::fs::remove_file(&empty_file);
        let fallback = fallback?;
        let fallback_raw = fallback.stdout;
        let limit = 200 * 1024;
        return Ok(String::from_utf8_lossy(
            if fallback_raw.len() > limit { &fallback_raw[..limit] } else { &fallback_raw },
        )
        .into_owned());
    }

    let limit = 200 * 1024;
    Ok(
        String::from_utf8_lossy(if raw.len() > limit { &raw[..limit] } else { &raw })
            .into_owned(),
    )
}

#[tauri::command]
pub async fn git_stage(project_path: String, file_path: String) -> Result<(), String> {
    run_git_check(&project_path, &["add", "--", &file_path])
}

#[tauri::command]
pub async fn git_unstage(project_path: String, file_path: String) -> Result<(), String> {
    run_git_check(&project_path, &["restore", "--staged", "--", &file_path])
}

#[tauri::command]
pub async fn git_stage_all(project_path: String) -> Result<(), String> {
    run_git_check(&project_path, &["add", "-A"])
}

#[tauri::command]
pub async fn git_unstage_all(project_path: String) -> Result<(), String> {
    run_git_check(&project_path, &["restore", "--staged", "."])
}

#[tauri::command]
pub async fn git_commit(project_path: String, message: String) -> Result<(), String> {
    run_git_check(&project_path, &["commit", "-m", &message])
}

#[tauri::command]
pub async fn git_show_file_diff(
    project_path: String,
    commit_hash: String,
    file_path: String,
) -> Result<String, String> {
    let output = run_git(
        &project_path,
        &["show", "--format=", &commit_hash, "--", &file_path],
    )?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    let raw = output.stdout;
    let limit = 500 * 1024;
    Ok(String::from_utf8_lossy(if raw.len() > limit { &raw[..limit] } else { &raw })
        .into_owned())
}

#[tauri::command]
pub async fn git_push(project_path: String, branch: Option<String>) -> Result<String, String> {
    let mut args = vec!["push".to_string()];
    if let Some(ref b) = branch.filter(|s| !s.is_empty()) {
        args.push("origin".to_string());
        args.push(b.clone());
    }
    let output = run_git(&project_path, &args)?;
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    if !output.status.success() {
        return Err(combined);
    }
    Ok(combined.trim().to_string())
}

#[tauri::command]
pub async fn git_pull(project_path: String) -> Result<String, String> {
    let output = run_git(&project_path, &["pull"])?;
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    if !output.status.success() {
        return Err(combined);
    }
    Ok(combined.trim().to_string())
}

#[derive(serde::Serialize)]
pub(crate) struct GitRemoteCounts {
    ahead: i32,
    behind: i32,
    branch: String,
}

#[tauri::command]
pub async fn git_remote_counts(
    project_path: String,
    branch: Option<String>,
) -> Result<GitRemoteCounts, String> {
    let branch = if let Some(b) = branch.filter(|s| !s.is_empty()) {
        b
    } else {
        let branch_out =
            run_git(&project_path, &["rev-parse", "--abbrev-ref", "HEAD"])?;
        String::from_utf8_lossy(&branch_out.stdout).trim().to_string()
    };

    let rev_str = format!("{}...@{{u}}", branch);
    let rev_out = run_git(
        &project_path,
        &["rev-list", "--count", "--left-right", &rev_str],
    );

    let (ahead, behind) = match rev_out {
        Ok(o) if o.status.success() => {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            let parts: Vec<&str> = s.split_whitespace().collect();
            if parts.len() == 2 {
                (parts[0].parse().unwrap_or(0), parts[1].parse().unwrap_or(0))
            } else {
                (0, 0)
            }
        }
        _ => (0, 0),
    };

    Ok(GitRemoteCounts { ahead, behind, branch })
}
