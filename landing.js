const header = document.querySelector("[data-header]");
const navToggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".site-nav");
const revealItems = document.querySelectorAll(".reveal");
const themeToggle = document.querySelector(".theme-toggle");
const languageToggle = document.querySelector(".language-toggle");
const themeColor = document.querySelector('meta[name="theme-color"]');

const translations = {
  zh: {
    pageTitle: "WebDAV Image Saver — 图片回到自己的云",
    description: "WebDAV Image Saver 是一款隐私优先的 Chrome 扩展。右键网页图片，即可直接保存到 Nextcloud、群晖、QNAP 或其他 WebDAV 服务器。",
    skipLink: "跳到主要内容",
    brandSubtitle: "保存到你自己的服务器",
    navFeatures: "功能",
    navHow: "使用方式",
    navPrivacy: "隐私",
    install: "安装扩展",
    support: "赞赏",
    heroTitle: "右键一下，<br />图片回到<span class=\"marker\">自己的云。</span>",
    heroLede: "跳过“下载、整理、再上传”。WebDAV Image Saver 让你在 Chrome 里，把网页图片直接送到 <em>Nextcloud、群晖、QNAP</em> 或任何 WebDAV 目录。",
    addChrome: "添加到 Chrome",
    viewGithub: "在 GitHub 查看",
    microProof: "开源 · 免费 · 无分析追踪",
    toastSent: "已送往 /Photos",
    demoStep1: "右键保存",
    demoStep2: "浏览器直传",
    demoStep3: "你的 WebDAV",
    proof1: "次右键<br />完成保存",
    proof2: "开发者服务器<br />经过你的图片",
    proof3: "WebDAV 目标<br />按需配置",
    proofTagline: "从网页到私有云，<br />最短的那条路。",
    featuresTitle: "收藏图片，<br />不必绕远路。",
    featuresLede: "把重复操作折叠成一次右键，同时保留你对文件、目录与服务器的完整控制。",
    directTitle: "浏览器直传",
    directBody: "图片从当前网页直接上传到你配置的 WebDAV，没有第三方网盘，也没有开发者运营的中转服务。",
    multiTitle: "多个目的地",
    multiBody: "为工作、灵感与归档配置不同服务器和目录，保存时直接选择。",
    cancelSeconds: "秒内可取消",
    controlTitle: "留一点反悔时间",
    controlBody: "上传前显示倒计时气泡；点错目标，也能立即取消。",
    privacyQuote: "“扩展不会收集、保存或向开发者传输你的图片、凭据、浏览数据或设置。”",
    readPrivacy: "阅读完整隐私政策",
    workflowTitle: "配置一次，<br />以后只管右键。",
    stepConnectTitle: "连接",
    stepConnectBody: "填写 WebDAV 地址、用户名与密码，先测试连接。",
    stepChooseTitle: "选择",
    stepChooseBody: "浏览服务器目录，为这个目标指定保存文件夹。",
    stepSaveTitle: "保存",
    stepSaveBody: "在任意网页图片上右键，选择目标，完成。",
    shotServers: "管理服务器",
    shotSetup: "添加并测试",
    shotSave: "右键保存",
    compatibilityNote: "以及任何兼容 WebDAV 的存储服务",
    privacyTitle: "你的图片，<br />不需要经过我们。",
    privacyBody: "WebDAV Image Saver 没有开发者运营的服务器、托管 API 或分析系统。配置保存在 Chrome 本地扩展存储中，图片由浏览器直接上传到你的服务器。",
    viewPrivacy: "查看隐私政策",
    privacyPoint1Title: "零数据收集",
    privacyPoint1Body: "不收集图片、凭据、浏览数据或设置",
    privacyPoint2Title: "零行为追踪",
    privacyPoint2Body: "不使用分析、广告或遥测脚本",
    privacyPoint3Title: "完整可审查",
    privacyPoint3Body: "源代码公开，权限用途清晰可查",
    finalTitle: "下一张喜欢的图片，<br />直接存回自己的云。",
    installFree: "免费安装 Chrome 扩展",
    downloadRelease: "或从 GitHub Releases 下载 →",
    footerIssues: "反馈问题",
    footerPrivacy: "隐私政策",
    openNavigation: "打开导航",
    closeNavigation: "关闭导航",
    switchToLight: "切换到浅色模式",
    switchToDark: "切换到深色模式",
    lightMode: "浅色模式",
    darkMode: "深色模式",
    switchLanguage: "切换到英文",
    languageTitle: "中英文切换",
    githubLabel: "打开 GitHub 仓库",
    donationLabel: "赞赏这个项目",
    donationTitle: "赞赏",
    brandLabel: "WebDAV Image Saver 首页",
    navLabel: "主要导航",
    demoLabel: "WebDAV Image Saver 使用效果预览",
    proofLabel: "产品特点",
    shotsLabel: "产品截图",
    compatibilityLabel: "兼容的 WebDAV 服务",
  },
  en: {
    pageTitle: "WebDAV Image Saver — Save images to your own cloud",
    description: "A privacy-first Chrome extension that saves web images directly to Nextcloud, Synology, QNAP, or any WebDAV server.",
    skipLink: "Skip to main content",
    brandSubtitle: "Save to your own server",
    navFeatures: "Features",
    navHow: "How it works",
    navPrivacy: "Privacy",
    install: "Install extension",
    support: "Support",
    heroTitle: "Right-click.<br />Save to <span class=\"marker\">your own cloud.</span>",
    heroLede: "Skip the download, sort, and upload routine. WebDAV Image Saver sends web images straight from Chrome to <em>Nextcloud, Synology, QNAP</em>, or any WebDAV folder.",
    addChrome: "Add to Chrome",
    viewGithub: "View on GitHub",
    microProof: "Open source · Free · No analytics",
    toastSent: "Sent to /Photos",
    demoStep1: "Right-click",
    demoStep2: "Direct upload",
    demoStep3: "Your WebDAV",
    proof1: "right-click<br />to save",
    proof2: "developer servers<br />touching your images",
    proof3: "WebDAV targets<br />configured as needed",
    proofTagline: "The shortest path<br />from the web to your cloud.",
    featuresTitle: "Save images.<br />Skip the detour.",
    featuresLede: "Collapse repetitive work into one right-click while keeping full control over your files, folders, and servers.",
    directTitle: "Browser to server",
    directBody: "Images upload from the current page straight to your WebDAV destination—without a third-party drive or developer-operated relay.",
    multiTitle: "Multiple destinations",
    multiBody: "Configure separate servers and folders for work, inspiration, and archives, then choose one when you save.",
    cancelSeconds: "seconds to cancel",
    controlTitle: "Time to change your mind",
    controlBody: "A short countdown appears before upload, so a wrong destination is easy to cancel.",
    privacyQuote: "“The extension never collects, stores, or sends your images, credentials, browsing data, or settings to the developer.”",
    readPrivacy: "Read the full privacy policy",
    workflowTitle: "Set it up once.<br />Then just right-click.",
    stepConnectTitle: "Connect",
    stepConnectBody: "Enter your WebDAV URL and credentials, then test the connection.",
    stepChooseTitle: "Choose",
    stepChooseBody: "Browse the server and select a destination folder for this target.",
    stepSaveTitle: "Save",
    stepSaveBody: "Right-click any web image, choose a destination, and you are done.",
    shotServers: "Manage servers",
    shotSetup: "Add and test",
    shotSave: "Right-click to save",
    compatibilityNote: "Plus any other WebDAV-compatible storage service",
    privacyTitle: "Your images<br />never pass through us.",
    privacyBody: "WebDAV Image Saver has no developer-operated server, hosted API, or analytics system. Configuration stays in Chrome local extension storage, and images upload directly from your browser to your server.",
    viewPrivacy: "View privacy policy",
    privacyPoint1Title: "Zero data collection",
    privacyPoint1Body: "No images, credentials, browsing data, or settings collected",
    privacyPoint2Title: "Zero behavior tracking",
    privacyPoint2Body: "No analytics, ads, or telemetry scripts",
    privacyPoint3Title: "Fully inspectable",
    privacyPoint3Body: "Open source, with every permission clearly explained",
    finalTitle: "Your next great find<br />belongs in your own cloud.",
    installFree: "Install the Chrome extension free",
    downloadRelease: "Or download from GitHub Releases →",
    footerIssues: "Report an issue",
    footerPrivacy: "Privacy",
    openNavigation: "Open navigation",
    closeNavigation: "Close navigation",
    switchToLight: "Switch to light mode",
    switchToDark: "Switch to dark mode",
    lightMode: "Light mode",
    darkMode: "Dark mode",
    switchLanguage: "切换到中文",
    languageTitle: "Switch language",
    githubLabel: "Open GitHub repository",
    donationLabel: "Support this project",
    donationTitle: "Support",
    brandLabel: "WebDAV Image Saver home",
    navLabel: "Main navigation",
    demoLabel: "WebDAV Image Saver preview",
    proofLabel: "Product highlights",
    shotsLabel: "Product screenshots",
    compatibilityLabel: "Compatible WebDAV services",
  },
};

let currentLanguage = localStorage.getItem("language") === "en" ? "en" : "zh";

const getCurrentTheme = () =>
  document.documentElement.dataset.theme ||
  (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

const updateThemeControl = (theme) => {
  const isDark = theme === "dark";
  const copy = translations[currentLanguage];
  themeToggle?.setAttribute("aria-label", isDark ? copy.switchToLight : copy.switchToDark);
  themeToggle?.setAttribute("title", isDark ? copy.lightMode : copy.darkMode);
  themeColor?.setAttribute("content", isDark ? "#111111" : "#f3f3f1");
};

const storedTheme = localStorage.getItem("theme");
if (storedTheme === "light" || storedTheme === "dark") {
  document.documentElement.dataset.theme = storedTheme;
}
updateThemeControl(getCurrentTheme());

themeToggle?.addEventListener("click", () => {
  const nextTheme = getCurrentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem("theme", nextTheme);
  updateThemeControl(nextTheme);
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (!localStorage.getItem("theme")) updateThemeControl(getCurrentTheme());
});

const updateHeader = () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 24);
};

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

navToggle?.addEventListener("click", () => {
  const isOpen = navToggle.getAttribute("aria-expanded") === "true";
  navToggle.setAttribute("aria-expanded", String(!isOpen));
  navToggle.setAttribute("aria-label", isOpen ? translations[currentLanguage].openNavigation : translations[currentLanguage].closeNavigation);
  nav?.classList.toggle("is-open", !isOpen);
});

nav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    navToggle?.setAttribute("aria-expanded", "false");
    navToggle?.setAttribute("aria-label", translations[currentLanguage].openNavigation);
    nav.classList.remove("is-open");
  });
});

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -50px" },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const screenshots = {
  servers: {
    src: "docs/screenshots/servers-overview.jpg",
    zh: {
      alt: "WebDAV Image Saver 的服务器管理界面",
      caption: "统一管理已经配置的 WebDAV 服务器与目标目录。",
    },
    en: {
      alt: "WebDAV Image Saver server management screen",
      caption: "Manage configured WebDAV servers and destination folders in one place.",
    },
  },
  setup: {
    src: "docs/screenshots/add-server-dialog.jpg",
    zh: {
      alt: "添加 WebDAV 服务器并测试连接",
      caption: "连接测试通过后，浏览并选择多级 WebDAV 目录。",
    },
    en: {
      alt: "Add a WebDAV server and test the connection",
      caption: "Test the connection, then browse and select a nested WebDAV folder.",
    },
  },
  save: {
    src: "docs/screenshots/context-menu-destination.jpg",
    zh: {
      alt: "在网页图片右键菜单中选择 WebDAV 目标",
      caption: "在任意网页图片上右键，选择已经配置的保存位置。",
    },
    en: {
      alt: "Choose a WebDAV destination from an image context menu",
      caption: "Right-click any web image and choose a configured destination.",
    },
  },
};

const screenshotImage = document.querySelector("[data-screenshot]");
const screenshotCaption = document.querySelector("[data-shot-caption]");
const shotTabs = document.querySelectorAll("[data-shot]");

const updateScreenshotCopy = () => {
  const selectedTab = document.querySelector('[data-shot][aria-selected="true"]');
  const shot = screenshots[selectedTab?.dataset.shot || "servers"];
  if (!shot || !screenshotImage) return;

  screenshotImage.alt = shot[currentLanguage].alt;
  if (screenshotCaption) screenshotCaption.textContent = shot[currentLanguage].caption;
};

const applyLanguage = (language) => {
  currentLanguage = language;
  const copy = translations[language];

  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.title = copy.pageTitle;
  document.querySelector('meta[name="description"]')?.setAttribute("content", copy.description);
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", copy.pageTitle);
  document.querySelector('meta[property="og:description"]')?.setAttribute("content", copy.description);

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const value = copy[element.dataset.i18n];
    if (value) element.textContent = value;
  });

  document.querySelectorAll("[data-i18n-html]").forEach((element) => {
    const value = copy[element.dataset.i18nHtml];
    if (value) element.innerHTML = value;
  });

  document.querySelector(".brand")?.setAttribute("aria-label", copy.brandLabel);
  nav?.setAttribute("aria-label", copy.navLabel);
  document.querySelector(".github-link")?.setAttribute("aria-label", copy.githubLabel);
  document.querySelector(".donation-link")?.setAttribute("aria-label", copy.donationLabel);
  document.querySelector(".donation-link")?.setAttribute("title", copy.donationTitle);
  document.querySelector(".hero-demo")?.setAttribute("aria-label", copy.demoLabel);
  document.querySelector(".proof-strip")?.setAttribute("aria-label", copy.proofLabel);
  document.querySelector(".screenshot-tabs")?.setAttribute("aria-label", copy.shotsLabel);
  document.querySelector(".compatibility")?.setAttribute("aria-label", copy.compatibilityLabel);
  navToggle?.setAttribute("aria-label", navToggle.getAttribute("aria-expanded") === "true" ? copy.closeNavigation : copy.openNavigation);
  languageToggle?.setAttribute("aria-label", copy.switchLanguage);
  languageToggle?.setAttribute("title", copy.languageTitle);

  updateThemeControl(getCurrentTheme());
  updateScreenshotCopy();
};

languageToggle?.addEventListener("click", () => {
  const nextLanguage = currentLanguage === "zh" ? "en" : "zh";
  localStorage.setItem("language", nextLanguage);
  applyLanguage(nextLanguage);
});

shotTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const shot = screenshots[tab.dataset.shot];
    if (!shot || !screenshotImage) return;

    shotTabs.forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
    screenshotImage.classList.add("is-changing");

    window.setTimeout(() => {
      screenshotImage.src = shot.src;
      screenshotImage.alt = shot[currentLanguage].alt;
      if (screenshotCaption) screenshotCaption.textContent = shot[currentLanguage].caption;
      screenshotImage.classList.remove("is-changing");
    }, 180);
  });
});

applyLanguage(currentLanguage);

const year = document.querySelector("[data-year]");
if (year) year.textContent = String(new Date().getFullYear());
