/** Keeps keyboard focus inside an open dialog; Escape remains owned by its caller. */
export function containDialogFocus(event: KeyboardEvent): void {
  event.stopPropagation()
  if (event.key !== 'Tab') return
  const dialog = event.currentTarget as HTMLElement
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
    .filter((control) => control.getClientRects().length > 0)
  const first = controls[0]
  const last = controls.at(-1)
  if (!first || !last) {
    event.preventDefault()
    dialog.focus()
  } else if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement as HTMLElement))) {
    event.preventDefault()
    first.focus()
  }
}
