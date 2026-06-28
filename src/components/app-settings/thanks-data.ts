// 感谢页数据。头像均已拉取到本地（src/assets/thanks/）并由 Vite 打包，
// 以保证 Nezha 离线时也能正常展示。
//
// - contributors：GitHub 上为 hanshuaikang/nezha 贡献过代码的开发者，按贡献量降序。
//   数据来源：`gh api repos/hanshuaikang/nezha/contributors`
// - supporters：在自媒体平台转发 / 支持过 Nezha 的博主，与官网
//   https://nezha.hanshutx.com/ 的「感谢支持」一致。

// 贡献者头像
import shouzi23333 from "../../assets/thanks/contributors/shouzi23333-rgb.jpg";
import NAMEWTA from "../../assets/thanks/contributors/NAMEWTA.jpg";
import Mr54233 from "../../assets/thanks/contributors/Mr54233.jpg";
import lizhian from "../../assets/thanks/contributors/lizhian.png";
import suntianc from "../../assets/thanks/contributors/suntianc.jpg";
import leafyoung from "../../assets/thanks/contributors/leafyoung.jpg";
import IvanYang9527 from "../../assets/thanks/contributors/IvanYang9527.jpg";
import ZhiAo1120 from "../../assets/thanks/contributors/ZhiAo1120.jpg";
import yixinshark from "../../assets/thanks/contributors/yixinshark.png";

// 自媒体头像
import hellogithub from "../../assets/thanks/supporters/hellogithub.svg";
import aigclink from "../../assets/thanks/supporters/aigclink.jpg";
import geekLite from "../../assets/thanks/supporters/geek_lite.jpg";
import ilovek8s from "../../assets/thanks/supporters/ilovek8s.jpg";
import mawen from "../../assets/thanks/supporters/mawen.png";
import yifei from "../../assets/thanks/supporters/yifei.png";
import jaywcjlove from "../../assets/thanks/supporters/jaywcjlove.png";
import vincentLogic from "../../assets/thanks/supporters/VincentLogic.png";
import githubDaily from "../../assets/thanks/supporters/github_daily.png";
import wwtlitee from "../../assets/thanks/supporters/wwtlitee.png";
import guanggangGithub from "../../assets/thanks/supporters/guanggang_github.png";
import amiaoapp from "../../assets/thanks/supporters/amiaoapp.png";

export interface Contributor {
  /** GitHub 用户名，同时作为展示名 */
  login: string;
  /** 本地头像（Vite 打包后的 URL） */
  avatar: string;
  /** GitHub 个人主页 */
  profile: string;
}

export interface Supporter {
  /** 展示用的友好名称 */
  name: string;
  /** 本地头像（Vite 打包后的 URL） */
  avatar: string;
  /** 关联链接（推特主页 / 网站），仅 action === "open" 时需要 */
  link?: string;
  /**
   * 点击行为：
   * - "open" 用默认浏览器打开 link（推特、网站）
   * - "copy" 把 name 复制到剪贴板（公众号，没有可直接打开的主页，复制名称便于在微信内搜索）
   */
  action: "open" | "copy";
}

export const CONTRIBUTORS: Contributor[] = [
  { login: "shouzi23333-rgb", avatar: shouzi23333, profile: "https://github.com/shouzi23333-rgb" },
  { login: "NAMEWTA", avatar: NAMEWTA, profile: "https://github.com/NAMEWTA" },
  { login: "Mr54233", avatar: Mr54233, profile: "https://github.com/Mr54233" },
  { login: "lizhian", avatar: lizhian, profile: "https://github.com/lizhian" },
  { login: "suntianc", avatar: suntianc, profile: "https://github.com/suntianc" },
  { login: "leafyoung", avatar: leafyoung, profile: "https://github.com/leafyoung" },
  { login: "IvanYang9527", avatar: IvanYang9527, profile: "https://github.com/IvanYang9527" },
  { login: "ZhiAo1120", avatar: ZhiAo1120, profile: "https://github.com/ZhiAo1120" },
  { login: "yixinshark", avatar: yixinshark, profile: "https://github.com/yixinshark" },
];

export const SUPPORTERS: Supporter[] = [
  { name: "HelloGitHub", avatar: hellogithub, link: "https://hellogithub.com/", action: "open" },
  { name: "AIGC Link", avatar: aigclink, link: "https://x.com/aigclink", action: "open" },
  { name: "Geek Lite", avatar: geekLite, link: "https://x.com/geek_lite", action: "open" },
  { name: "I Love K8s", avatar: ilovek8s, link: "https://x.com/ilovek8s", action: "open" },
  { name: "码问", avatar: mawen, action: "copy" },
  { name: "一飞开源", avatar: yifei, action: "copy" },
  { name: "jaywcjlove", avatar: jaywcjlove, link: "https://x.com/jaywcjlove", action: "open" },
  { name: "Vincent | 信号＞噪音", avatar: vincentLogic, link: "https://x.com/VincentLogic", action: "open" },
  { name: "GitHubDaily", avatar: githubDaily, link: "https://x.com/GitHub_Daily", action: "open" },
  { name: "奶牛叔", avatar: wwtlitee, link: "https://x.com/WWTLitee", action: "open" },
  { name: "逛逛Github", avatar: guanggangGithub, action: "copy" },
  { name: "APP喵", avatar: amiaoapp, link: "https://x.com/amiaoapp", action: "open" },
];
