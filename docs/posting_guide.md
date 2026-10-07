
# Posting Guide for VarunVaidhiya.com

This guide explains how to add new blog posts to your website.

## Directory Structure

All blog posts are located in `src/content/blog/`. Each post is a Markdown (`.md`) or MDX (`.mdx`) file.

## Creating a New Post

1.  **Create a file**: Create a new file in `src/content/blog/` with a descriptive name, e.g., `my-new-post.md`.
2.  **Add Frontmatter**: At the top of the file, add the required metadata between `---` fences.

### Example Frontmatter

```markdown
---
title: "My New Post Title"
author: "Varun Vaidhiya"
pubDatetime: 2026-02-05T14:00:00Z
slug: "my-new-post"
featured: false
draft: false
tags:
  - webdev
  - personal
description: "A short description of what this post is about."
---

Your content goes here...
```

### Frontmatter Fields

-   **title** (required): The title of your post.
-   **author** (optional): Your name. Defaults to the site author if omitted.
-   **pubDatetime** (required): The publication date and time in ISO 8601 format. Use `YYYY-MM-DDTHH:MM:SSZ`.
-   **slug** (optional): The URL slug for the post. If omitted, the filename is used.
-   **featured** (optional): Set to `true` to display this post in the "Featured" section on the homepage.
-   **draft** (optional): Set to `true` to hide the post from production builds.
-   **tags** (optional): A list of tags related to the post.
-   **description** (required): A brief summary of the post for SEO and previews.

## Adding Images

1.  Place your images in `src/assets/images/` or `public/images/`.
2.  Reference them in your markdown: `![Alt Text](/images/my-image.jpg)` (if in public) or import them if using Astro assets.

## Previewing

Run `npm run dev` in your terminal to start the local development server and preview your changes at `http://localhost:4321`.
