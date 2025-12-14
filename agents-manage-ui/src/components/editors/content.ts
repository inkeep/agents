export const mdContent = `# Welcome to the Markdown Demo

This demo showcases **bidirectional** markdown support in Tiptap with extended features.

## Features

- **Bold text** and *italic text*
- \`inline code\` and code blocks
- [Links](https://tiptap.dev)
- Lists and more!

## Extended Features

## Task Lists

- [ ] Incomplete task
  - [ ] Nested incomplete task
  - [x] Completed task
- [x] Completed task
  - [ ] Incomplete task
  - [x] Completed task

## Table

| Tables   |      Are      |  Cool |
|----------|:-------------:|------:|
| col 1 is |  left-aligned | $1600 |
| col 2 is |    centered   |   $12 |
| col 3 is | right-aligned |    $1 |


<h2>HTML Support</h2>

<p>Markdown support comes with additional HTML support so your content can be easily parsed as well, even if not in Markdown format.</p>

<ul>
  <li>
    <p>
      <strong>Lists</strong>
    </p>
  </li>
  <li>
    <p>and</p>
  </li>
  <li>
    <p>Sublists</p>
    <ul>
      <li>
        <p>See?</p>
      </li>
    </ul>
  </li>
</ul>

### Code

Tiptap supports \`inline code\` and full code blocks:

\`\`\`javascript
import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'

const editor = new Editor({
  extensions: [StarterKit],
  content: '<p>Hello World!</p>',
  element: document.querySelector('#editor'),
})
\`\`\`

### Try editing the markdown on the left:

1. Edit the Markdown text
2. Click "Parse Markdown"
3. See it render in the editor!
  1. Be very happy
  2. Enjoy the parsed content
4. Try adding YouTube videos, mentions, math expressions, and custom components directly in the editor
5. Click "Extract Markdown" to see the serialized output
  1. Be amazed by the fidelity of the conversion
  2. Share your feedback!

You can also edit in the editor and see the markdown update.`;
