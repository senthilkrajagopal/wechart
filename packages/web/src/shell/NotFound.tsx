/**
 * What an address that matches nothing shows, and what a page the user may
 * not open shows too, so the two can't be told apart (rule 67; T500).
 */
export function NotFound() {
  return (
    <>
      <h1 className="workspace-title">Not found</h1>
      <p>Nothing here matches that address.</p>
    </>
  );
}
