export type AnchorCandidate = {
  element: Element;
  label: string;
  confidence: number;
};

export type InjectionPageState =
  | { kind: "idle" }
  | { kind: "detail-loading" }
  | { kind: "detail-ready"; context: unknown; anchor: AnchorCandidate }
  | { kind: "unsupported"; reason: string };

export type ProbeShellResult = {
  shellRoot: Element | null;
  overlayRoot: Element | null;
};

export type ProbeDetailResult = {
  isOpen: boolean;
  detailRoot: Element | null;
  reason?: string;
};

export type InjectionAdapter<TContext> = {
  probeShell(): ProbeShellResult;
  probeDetail(): ProbeDetailResult;
  probeContext(detailRoot: Element): TContext | null;
  probeAnchor(detailRoot: Element): AnchorCandidate | null;
  render(state: {
    pageState: InjectionPageState;
    context: TContext | null;
    anchor: AnchorCandidate | null;
  }): void;
  cleanup?(): void;
};
