import type { CachedFarmLot } from "@/lib/farm-lots-cache";
import { translateCropName, useAppLocale } from "@/lib/i18n";
import { Check, ChevronDown, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type SavedLotsBarProps = {
  lots: CachedFarmLot[];
  activeLotId: string | null;
  activeLotName: string;
  onSelectLot: (lotId: string) => void;
  onRenameLot: (lotId: string, name: string) => void;
  onStartNewLot: () => void;
  onDeleteLot: (lotId: string) => void;
  hasLeftDrawer?: boolean;
};

export function SavedLotsBar({
  lots,
  activeLotId,
  activeLotName,
  onSelectLot,
  onRenameLot,
  onStartNewLot,
  onDeleteLot,
  hasLeftDrawer = false,
}: SavedLotsBarProps) {
  const { locale } = useAppLocale();
  const isCeb = locale === "ceb";
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingId(null);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function startRename(lotId: string, currentName: string) {
    setEditingId(lotId);
    setDraftName(currentName);
  }

  function commitRename(lotId: string) {
    onRenameLot(lotId, draftName);
    setEditingId(null);
  }

  if (lots.length === 0) {
    return null;
  }

  const hasActiveSavedLot = Boolean(activeLotId && lots.some((lot) => lot.id === activeLotId));

  const countLabel =
    lots.length === 1
      ? isCeb
        ? "1 luna"
        : "1 lot"
      : isCeb
        ? `${lots.length} ka luna`
        : `${lots.length} lots`;

  return (
    <div
      ref={containerRef}
      className={`saved-lots-float${hasLeftDrawer ? " has-left-drawer" : ""}`}
      data-testid="saved-lots-bar"
    >
      <div className="saved-lots-pill-row">
        <button
          type="button"
          className={`saved-lots-trigger${open ? " is-open" : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title={
            isCeb
              ? "Tan-awa o balhin sa naka-cache nga mga uma"
              : "View or switch cached farm lots"
          }
        >
          <span className="saved-lots-pin-badge">
            <MapPin size={13} strokeWidth={2.2} />
          </span>
          <span className="saved-lots-trigger-text">
            <strong>
              {hasActiveSavedLot
                ? activeLotName || (isCeb ? "Akong Uma" : "My Farm Lot")
                : isCeb
                  ? "Mga luna"
                  : "Saved lots"}
            </strong>
            <span className="saved-lots-count-chip">{countLabel}</span>
          </span>
          <ChevronDown size={14} className={`saved-lots-caret${open ? " is-rotated" : ""}`} />
        </button>

        <button
          type="button"
          className="saved-lots-new-btn"
          onClick={() => {
            onStartNewLot();
            setOpen(false);
          }}
          title={isCeb ? "Pagmarka og bag-ong luna" : "Mark another farm lot"}
        >
          <Plus size={14} strokeWidth={2.2} />
          <span>{isCeb ? "Bag-ong luna" : "New lot"}</span>
        </button>
      </div>

      {open && (
        <div className="saved-lots-popover" role="region" aria-label={isCeb ? "Naka-save nga mga luna" : "Saved farm lots"}>
          <div className="saved-lots-popover-head">
            <span>{isCeb ? "Naka-save nga mga Uma" : "Saved Farm Lots"}</span>
            <small>{lots.length ? countLabel : isCeb ? "Wala pay namarkahan" : "None plotted yet"}</small>
          </div>

          {!lots.length ? (
            <p className="saved-lots-empty">
              {isCeb
                ? "Pag-drowing og utlanan o itakda ang lokasyon aron ma-cache kini nga luna."
                : "Draw a lot boundary or confirm a point to cache this lot automatically."}
            </p>
          ) : (
            <ul className="saved-lots-list">
              {lots.map((lot) => {
                const isActive = lot.id === activeLotId;
                const isEditing = editingId === lot.id;
                const hasRotation = Boolean(lot.cropRotation.plannerResult);
                const lossPhp = lot.disasterRecovery.estimatedLossPhp;
                return (
                  <li
                    key={lot.id}
                    className={`saved-lots-item${isActive ? " is-active" : ""}`}
                  >
                    {isEditing ? (
                      <form
                        className="saved-lots-rename-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          commitRename(lot.id);
                        }}
                      >
                        <input
                          type="text"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          placeholder={isCeb ? "Ngalan sa luna..." : "Lot name..."}
                          aria-label={isCeb ? "Ngalan sa luna" : "Lot name"}
                          autoFocus
                          maxLength={48}
                        />
                        <button
                          type="submit"
                          className="saved-lots-icon-btn is-confirm"
                          aria-label={isCeb ? "I-save ang ngalan" : "Save lot name"}
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          className="saved-lots-icon-btn"
                          onClick={() => setEditingId(null)}
                          aria-label={isCeb ? "Kanselahon" : "Cancel rename"}
                        >
                          <X size={13} />
                        </button>
                      </form>
                    ) : (
                      <div className="saved-lots-item-row">
                        <button
                          type="button"
                          className="saved-lots-select-btn"
                          onClick={() => {
                            onSelectLot(lot.id);
                            setOpen(false);
                          }}
                        >
                          <span className="saved-lots-item-dot" aria-hidden="true" />
                          <span className="saved-lots-item-meta">
                            <span className="saved-lots-item-name">{lot.name}</span>
                            <span className="saved-lots-item-sub">
                              {translateCropName(lot.farm.crop, locale)} · {lot.farm.area} ha
                              {hasRotation ? (isCeb ? " · May plano" : " · Plan saved") : ""}
                              {lossPhp > 0 ? ` · ₱${lossPhp.toLocaleString("en-PH")}` : ""}
                            </span>
                          </span>
                        </button>

                        <div className="saved-lots-item-actions">
                          <button
                            type="button"
                            className="saved-lots-icon-btn"
                            onClick={() => startRename(lot.id, lot.name)}
                            aria-label={
                              isCeb ? `Ilisi ang ngalan sa ${lot.name}` : `Rename ${lot.name}`
                            }
                            title={isCeb ? "Ilisi ang ngalan" : "Rename lot"}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            className="saved-lots-icon-btn is-danger"
                            onClick={() => onDeleteLot(lot.id)}
                            aria-label={isCeb ? `Tangtanga ang ${lot.name}` : `Remove ${lot.name}`}
                            title={isCeb ? "Tangtangon ang luna" : "Remove lot"}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
