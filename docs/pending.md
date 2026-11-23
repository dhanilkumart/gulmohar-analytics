Implement a global modal/dialog interaction behaviour across the entire Gulmohar Analytics application.

### Requirement
All modal dialogs and popup forms must remain open when a user clicks outside the dialog (on the backdrop or surrounding area).

Currently, clicking outside a popup may close it. We want to prevent this behaviour throughout the application.

### Implementation instructions

1. Audit all existing modal/dialog components and identify the common dialog implementation or UI component.
2. Apply the behaviour centrally wherever possible, rather than modifying individual dialogs unnecessarily.
3. Disable closing a dialog through outside/backdrop clicks.
4. Keep the existing close mechanisms working:
   - Close (X) button.
   - Cancel button.
   - Successful form submission, where applicable.
   - Escape key, unless an existing dialog has a specific reason to behave differently.
5. Ensure this works consistently for:
   - Create and edit forms.
   - Confirmation dialogs.
   - Password reset dialogs.
   - User Management dialogs.
   - Master Data dialogs.
   - All other modal dialogs throughout the application.
6. Do not disable outside-click behaviour for dropdowns, select menus, tooltips, or other non-modal components.
7. Preserve existing styling, animations, form state, validation, and functionality.

### Verification
- Open several dialogs from different modules.
- Click outside each dialog and confirm it stays open.
- Verify Cancel and X buttons still close it.
- Verify form submission works normally.
- Run ESLint and TypeScript checks on affected files.

Keep the implementation focused. Reuse the existing UI component configuration if possible. Do not introduce unnecessary dependencies or modify unrelated functionality.










