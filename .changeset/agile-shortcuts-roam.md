---
"helmor": patch
---

Loosen up keyboard shortcuts and the inspector tabs panel:
- Make global shortcuts (Cmd+R run script, sidebar/zen toggles, workspace navigation, commit/PR actions) fire from anywhere in the window instead of silently doing nothing when focus is in the file editor.
- Cmd+T while looking at script output now opens a new terminal instead of a new chat session.
- Any inspector tab — Setup, Run, a terminal tab, or the "+" button — now opens the tabs panel when clicked, and collapses it when you click the already-active tab.
