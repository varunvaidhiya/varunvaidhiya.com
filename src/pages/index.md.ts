import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  const markdownContent = `# Varun Vaidhiya

Personal website and blog.

## Navigation

- [About](/about.md)
- [Recent Posts](/posts.md)
- [Archives](/archives.md)
- [RSS Feed](/rss.xml)

## Links

- GitHub: [@varunvaidhiya](https://github.com/varunvaidhiya)
- LinkedIn: [@varunvaidhiya](https://www.linkedin.com/in/varunvaidhiya)

---

*This is the markdown-only version of varunvaidhiya.me. Visit [varunvaidhiya.me](https://varunvaidhiya.me) for the full experience.*`;

  return new Response(markdownContent, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
