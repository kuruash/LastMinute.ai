# components/workspace/

UI for the Main Learning Workspace (Screen B): 3-panel layout after upload.

| File              | Panel   | Contents                                      |
| ----------------- | ------- | --------------------------------------------- |
| `topic-nav.tsx`   | Left    | Topics list, progress dots, "Weak" tags       |
| `mission-canvas.tsx` | Center | Mission card, interactive widget, answer UI   |
| `support-panel.tsx`  | Right   | Checklist, Ask tutor, hint ladder, misconception log |

Used by `app/workspace/page.tsx`. Data comes from `lib/workspace-mock.ts` (replace with API/agents later).
