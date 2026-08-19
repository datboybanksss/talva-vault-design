<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Product decisions

### Dark mode — deferred (decided)
Dark mode is **intentionally out of scope** for TalVault at this stage. It is a
known future item, not an unresolved question: do not add a theme toggle or
`.dark` overrides without an explicit decision to reverse this.

The design system is already structured to support it without a rework — all
colours/surfaces/shadows live as semantic tokens in `:root` in `src/styles.css`
and the `dark` variant is registered. Adding it later = one `.dark { ... }` token
block plus a toggle. See the note at the top of `src/styles.css`.
