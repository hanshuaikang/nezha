use std::path::PathBuf;

#[cfg(not(windows))]
mod unix;
#[cfg(windows)]
mod windows;

#[cfg(not(windows))]
use self::unix as imp;
#[cfg(windows)]
use self::windows as imp;

pub(crate) struct ShellCommand {
    pub(crate) program: String,
    pub(crate) args: Vec<String>,
}

pub(crate) fn home_dir() -> Option<PathBuf> {
    imp::home_dir()
}

pub(crate) fn login_shell_env() -> &'static [(String, String)] {
    imp::login_shell_env()
}

pub(crate) fn login_shell_path() -> &'static str {
    imp::login_shell_path()
}

pub(crate) fn default_shell_command() -> ShellCommand {
    imp::default_shell_command()
}

pub(crate) fn detect_path(binary: &str) -> String {
    imp::detect_path(binary)
}
