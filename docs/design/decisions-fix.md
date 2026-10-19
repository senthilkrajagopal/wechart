# Lane FIX's design decisions

Lane FIX's calls on the checkpoints' fixes, kept apart so lanes don't conflict; everyone else's are in [decisions-2026-10-08.md](./decisions-2026-10-08.md) under "Later decisions" and in the other lanes' files.

| ID | Question | Decision | Why | Departs |
|---|---|---|---|---|
| FIX-1 Ctrl+Q while a dialog is open (AC-480) | What does Ctrl+Q do while Save…, Save as new… or another of the workspace's modal dialogs is open? | **Nothing. It opens no tab, and the browser does nothing with it either, since the key is still taken. This covers every modal dialog in the workspace, not only Save…: a new tab would hide whatever the dialog is about behind the tab it opens.** Lane FIX's call, overturnable. | ⌘/Ctrl+S already does nothing while Save… is open (T816's review). A new tab unmounts the open tab's dialog, and what was typed in it. | No |
