import type { Tile } from '../model/document';

/**
 * An image tile (AC-063; direction.md §2: an image "stored with the
 * dashboard, with required alt text (flagged on the tile until set) and Fit
 * inside or Fill and crop").
 *
 * In edit mode a tile with no alternative text says so on the tile itself
 * (direction.md rule 42): a reader who cannot see the image gets nothing from
 * it until someone writes one, and the person who can write it is the one
 * looking at the tile.
 */
export function ImageTile({ tile, editing }: { tile: Tile; editing: boolean }) {
  const alt = tile.alt?.trim() ?? '';
  return (
    <div className="image-tile">
      {editing && alt === '' ? (
        <p className="image-tile__warning" data-testid="image-alt-missing">
          {/* Icon plus label, never colour alone (direction.md rule 3). */}
          <span aria-hidden="true">⚠</span> No alternative text
        </p>
      ) : null}
      {tile.imageId === undefined ? (
        editing ? (
          <p className="image-tile__empty">No image yet. Add one in Properties.</p>
        ) : null
      ) : (
        <img
          className={`image-tile__image image-tile__image--${tile.fit ?? 'contain'}`}
          src={`/api/images/${encodeURIComponent(tile.imageId)}`}
          alt={alt}
        />
      )}
    </div>
  );
}
