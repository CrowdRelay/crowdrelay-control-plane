# components/app

App-level adapters over the stock solid-ui primitives in `../ui/`.

`../ui/` holds registry files exactly as `solidui-cli add` writes them — do not
edit them; re-add to update. The console's call sites predate the stock APIs
(`<Switch checked label onChange>`, `<Alert tone>`, `<Card flat>`,
`toast.success()`, `writes` on controls), so each file here keeps that API and
renders it with the stock component and stock theme tokens only. Visual choices
live in `../ui/`; behaviour (read-only guarding, legacy variant names) lives here.
