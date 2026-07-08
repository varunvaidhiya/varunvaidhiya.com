# Knowledge folder

Drop documents here to add them to the **Digital Mind**'s knowledge base. Anything
in this folder is ingested at build time (`npm run digital-mind:index`, which also
runs on every deploy), chunked, and indexed alongside the blog and About page.

## Supported file types

- **Markdown** — `.md`, `.mdx`, `.markdown`
- **Plain text** — `.txt`
- **PDF** — `.pdf` (text extracted with `unpdf`)
- **Word** — `.docx` (text extracted with `mammoth`)

## Optional Markdown frontmatter

```yaml
---
title: Robotics Architecture Notes   # defaults to the filename
url: https://example.com/source      # citation link (optional; omit for uploads)
tags: [robotics, ros2, architecture] # optional
visibility: public                   # public (default) | private
---
```

## Notes

- `README.md` and any file starting with `_` are ignored.
- **Only `public` documents are written to the committed index.** A file marked
  `visibility: private` (or anything other than `public`) is skipped here —
  private/permissioned documents belong to the admin area (a later milestone)
  with proper private storage, so they never land in the public repo.
- PDFs/DOCX have no web URL, so their citations show the document title without a
  link. Add a `url` in frontmatter (Markdown only) to make a citation clickable.

This folder is intentionally empty apart from these instructions — add your own
notes, papers, and design docs.
