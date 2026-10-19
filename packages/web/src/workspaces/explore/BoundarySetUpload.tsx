import { boundarySetProblem, BOUNDARY_SET_MAX_BYTES } from '@wechart/core';
import { useId, useState } from 'react';

import { StateLine } from '../../shell/StatusIcon';
import {
  proposeBoundarySet,
  uploadBoundarySet,
  type OfferedBoundarySet,
} from '../../query/boundarySets';

/**
 * Upload a boundary set (T979, AC-628; R81-1): a read-write member's GeoJSON
 * for the Map, taken into their My workspace to go to this folder, then
 * proposed to it — it reaches the folder, and its charts' Boundary set, only
 * once a reviewer approves. Checked before it is sent: polygons and
 * multipolygons, each with the key property, its keys unique; a refusal
 * names the first feature that fails, as the API's would.
 */
export function BoundarySetUpload({ folderId }: { readonly folderId: string }) {
  const ids = useId();
  const [name, setName] = useState('');
  const [keyProperty, setKeyProperty] = useState('');
  const [text, setText] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState<OfferedBoundarySet | undefined>(undefined);
  const [proposed, setProposed] = useState(false);

  const upload = async () => {
    setProblem(undefined);
    if (name.trim() === '') return setProblem('Give the boundary set a name.');
    if (text === undefined) return setProblem('Choose a GeoJSON file.');
    if (text.length > BOUNDARY_SET_MAX_BYTES) return setProblem('A boundary set is at most 5 MB.');
    let geojson: unknown;
    try {
      geojson = JSON.parse(text);
    } catch {
      return setProblem('This file isn’t JSON.');
    }
    const refused = boundarySetProblem(geojson, keyProperty);
    if (refused !== undefined) return setProblem(refused);
    setBusy(true);
    try {
      setUploaded(
        await uploadBoundarySet({ name: name.trim(), keyProperty: keyProperty.trim(), geojson, targetFolderId: folderId }),
      );
    } catch (failure) {
      setProblem(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const propose = async () => {
    if (uploaded === undefined) return;
    setProblem(undefined);
    setBusy(true);
    try {
      await proposeBoundarySet(uploaded.id);
      setProposed(true);
    } catch (failure) {
      setProblem(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel-section" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`}>Upload a boundary set</h2>
      <p className="panel-section__note">
        GeoJSON polygons for the Map, each holding the key property your data names regions by.
        It goes into My workspace, and reaches this folder once a reviewer approves its proposal.
      </p>
      {uploaded === undefined ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void upload();
          }}
        >
          <div className="field">
            <label htmlFor={`${ids}-name`}>Name</label>
            <input
              id={`${ids}-name`}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${ids}-key`}>Key property</label>
            <input
              id={`${ids}-key`}
              type="text"
              value={keyProperty}
              onChange={(event) => setKeyProperty(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${ids}-file`}>GeoJSON file</label>
            <input
              id={`${ids}-file`}
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file === undefined) return setText(undefined);
                void file.text().then(setText);
              }}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Upload to My workspace
          </button>
        </form>
      ) : (
        <>
          <StateLine kind="info" testId="boundary-set-uploaded">
            {uploaded.name} is in My workspace: {uploaded.regions.toLocaleString('en-US')} regions.
          </StateLine>
          {proposed ? (
            <StateLine kind="info" testId="boundary-set-proposed">
              Proposed. It reaches the folder once a reviewer approves it.
            </StateLine>
          ) : (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void propose()}>
              Propose to the folder
            </button>
          )}
        </>
      )}
      {problem === undefined ? null : (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
