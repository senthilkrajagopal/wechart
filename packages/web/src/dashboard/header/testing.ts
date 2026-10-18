import userEvent from '@testing-library/user-event';

/**
 * Opens the dashboard's header sheet, where the description, the ownership
 * line and the filter bar are (F43): the reader's own step since T828
 * (AC-490). A sheet already open — or one shown open while editing, with no
 * toggle (rule 114) — is left as it is.
 */
export async function openHeaderSheet(): Promise<void> {
  const toggle = document.querySelector<HTMLElement>('button.header-toggle[aria-controls]');
  if (toggle === null || toggle.getAttribute('aria-expanded') === 'true') return;
  await userEvent.click(toggle);
}
