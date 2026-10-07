import { SITE } from "./consts";

export const SOCIALS = [
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/in/varunvaidhiya",
    linkTitle: `${SITE.title} on LinkedIn`,
    icon: "linkedin",
    active: true,
  },
  {
    name: "Github",
    href: "https://github.com/varunvaidhiya",
    linkTitle: `${SITE.title} on GitHub`,
    icon: "github",
    active: true,
  },
  {
    name: "OhhO Robotics",
    href: "https://github.com/ohho-robotics",
    linkTitle: "OhhO Robotics on GitHub",
    icon: "github",
    active: true,
  },
  {
    name: "PyPI",
    href: "https://pypi.org/user/varunvaidhiya/",
    linkTitle: `${SITE.title} on PyPI`,
    icon: "pypi",
    active: true,
  },
  {
    name: "YouTube",
    href: "https://www.youtube.com/@varun.vaidhiya",
    linkTitle: `${SITE.title} on YouTube`,
    icon: "youtube",
    active: true,
  },
  {
    name: "Substack",
    href: "https://substack.com/@varunvaidhiya",
    linkTitle: `${SITE.title} on Substack`,
    icon: "substack",
    active: true,
  },
  {
    name: "X",
    href: "https://x.com/VarunVaidhiya",
    linkTitle: `${SITE.title} on X/Twitter`,
    icon: "twitter",
    active: true,
  },
  {
    name: "Mail",
    href: "mailto:varun.vaidhiya@gmail.com",
    linkTitle: `Send an email to ${SITE.title}`,
    icon: "mail",
    active: true,
  },
] as const;

export const SHARE_LINKS = [
  {
    name: "X",
    href: "https://x.com/intent/post?url=",
    linkTitle: `Share this post on X`,
    icon: "twitter",
  },
  {
    name: "BlueSky",
    href: "https://bsky.app/intent/compose?text=",
    linkTitle: `Share this post on BlueSky`,
    icon: "bluesky",
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/sharing/share-offsite/?url=",
    linkTitle: `Share this post on LinkedIn`,
    icon: "linkedin",
  },
  {
    name: "WhatsApp",
    href: "https://wa.me/?text=",
    linkTitle: `Share this post via WhatsApp`,
    icon: "whatsapp",
  },
  {
    name: "Facebook",
    href: "https://www.facebook.com/sharer.php?u=",
    linkTitle: `Share this post on Facebook`,
    icon: "facebook",
  },
  {
    name: "Telegram",
    href: "https://t.me/share/url?url=",
    linkTitle: `Share this post via Telegram`,
    icon: "telegram",
  },
  {
    name: "Pinterest",
    href: "https://pinterest.com/pin/create/button/?url=",
    linkTitle: `Share this post on Pinterest`,
    icon: "pinterest",
  },
  {
    name: "Mail",
    href: "mailto:?subject=See%20this%20post&body=",
    linkTitle: `Share this post via email`,
    icon: "mail",
  },
] as const;
