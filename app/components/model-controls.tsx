"use client";

import { useLayoutEffect, useId, useRef, useState, type ReactNode } from "react";

type ModelControlsProps = {
  label: string;
  summary: string;
  notice?: string;
  error?: string;
  children: ReactNode;
};

// A native auto popover supplies light-dismiss and Escape behavior, and its
// top-layer panel cannot be clipped by the card's scrolling workspace.
export function ModelControls({ label, summary, notice, error, children }: ModelControlsProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    function position() {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const anchor = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      panel.style.maxHeight = `${(viewport?.height ?? window.innerHeight) - 24}px`;
      const bounds = panel.getBoundingClientRect();
      const leftEdge = (viewport?.offsetLeft ?? 0) + 12;
      const topEdge = (viewport?.offsetTop ?? 0) + 12;
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 24;
      const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - 24;
      const above = anchor.top - topEdge - 8;
      const below = bottomEdge - anchor.bottom - 8;
      const top = above >= bounds.height || above > below ? anchor.top - bounds.height - 8 : anchor.bottom + 8;
      panel.style.left = `${Math.max(leftEdge, Math.min(anchor.right - bounds.width, rightEdge - bounds.width))}px`;
      panel.style.top = `${Math.max(topEdge, Math.min(top, bottomEdge - bounds.height))}px`;
      panel.style.visibility = "visible";
    }
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    const observer = new ResizeObserver(position);
    if (panelRef.current) observer.observe(panelRef.current);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
      observer.disconnect();
    };
  }, [open]);

  return (
    <div className="model-controls">
      <button ref={triggerRef} type="button" className="model-controls-trigger" popoverTarget={id}
        aria-label={`${label}: ${summary}`} aria-expanded={open} aria-controls={id} title={`${label}: ${summary}`}>
        <span>{summary}</span><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
      </button>
      {notice && <p className="model-controls-notice" role="status">{notice}</p>}
      {error && <p className="model-controls-error" role="alert">{error}</p>}
      <div ref={panelRef} id={id} popover="auto" className="model-controls-panel" role="dialog" aria-label={label}
        onToggle={(event) => {
          const isOpen = event.currentTarget.matches(":popover-open");
          if (!isOpen) event.currentTarget.style.visibility = "hidden";
          setOpen(isOpen);
        }}>
        <div className="model-controls-heading"><strong>{label}</strong><button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label={`Close ${label.toLowerCase()}`}>×</button></div>
        {children}
      </div>
    </div>
  );
}
