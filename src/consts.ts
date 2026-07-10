// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

interface SocialLink {
  href: string;
  label: string;
}

interface Site {
  website: string;
  author: string;
  profile: string;
  desc: string;
  title: string;
  ogImage: string;
  lightAndDarkMode: boolean;
  postPerIndex: number;
  postPerPage: number;
  scheduledPostMargin: number;
  showArchives: boolean;
  showBackButton: boolean;
  editPost: {
    enabled: boolean;
    text: string;
    url: string;
  };
  dynamicOgImage: boolean;
  lang: string;
  timezone: string;
}

// Site configuration
export const SITE: Site = {
  website: "https://varunvaidhiya.com/",
  author: "Varun Vaidhiya",
  profile: "https://varunvaidhiya.com/about",
  desc: "Software Engineer specialising in AI, Robotics, and Performance Optimisation. Based in the UK.",
  title: "Varun Vaidhiya",
  ogImage: "varun-avatar.jpg",
  lightAndDarkMode: true,
  postPerIndex: 10,
  postPerPage: 10,
  scheduledPostMargin: 15 * 60 * 1000,
  showArchives: false,
  showBackButton: false,
  editPost: {
    enabled: true,
    text: "Edit on GitHub",
    url: "https://github.com/varunvaidhiya/varunvaidhiya.com/edit/main/",
  },
  dynamicOgImage: true,
  lang: "en",
  timezone: "Asia/Kolkata",
};

export const SITE_TITLE = SITE.title;
export const SITE_DESCRIPTION = SITE.desc;

// Navigation links
export const NAV_LINKS: SocialLink[] = [
  {
    href: "/",
    label: "Blog",
  },
  {
    href: "/about",
    label: "About",
  },
];

// Social media links
export const SOCIAL_LINKS: SocialLink[] = [
  {
    href: "https://github.com/varunvaidhiya",
    label: "GitHub",
  },
  {
    href: "https://www.youtube.com/@varun.vaidhiya",
    label: "YouTube",
  },
  {
    href: "https://substack.com/@varunvaidhiya",
    label: "Substack",
  },
  {
    href: "/rss.xml",
    label: "RSS",
  },
];

// Icon map for social media
export const ICON_MAP: Record<string, string> = {
  GitHub: "github",
  Twitter: "twitter",
  BlueSky: "bsky",
  RSS: "rss",
  Email: "mail",
};

// Digital Mind — the AI assistant trained on Varun's professional knowledge.
// Toggle `enabled` to hide the feature site-wide without removing any code.
export const DIGITAL_MIND = {
  enabled: true,
  // Same-origin endpoints (served by the Vercel Functions in /api). Keeping them
  // same-origin means the site's strict CSP `connect-src 'self'` already allows it.
  endpoint: "/api/digital-mind/chat",
  // Lists the configured LLM providers (Kimi K2 / Gemini) for the model switcher.
  providersEndpoint: "/api/digital-mind/providers",
  buttonLabel: "Ask Varun",
  title: "Varun's Digital Mind",
  subtitle: "AI trained on my work",
  intro:
    "Ask me anything about my projects, robotics and ROS2 work, AI and embedded systems, or the engineering decisions behind them.",
  placeholder: "Ask about my projects, robotics, AI…",
  disclaimer: "AI answers grounded in Varun's notes and posts. May be imperfect.",
  examples: [
    "What robotics projects have you worked on?",
    "Tell me about your AI-on-Arm work.",
    "What are you most proud of building?",
    "How do you approach performance optimisation?",
  ],
};
