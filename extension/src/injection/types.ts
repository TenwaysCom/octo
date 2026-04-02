export type AnchorCandidate = {
  element: Element;
  label: string;
  confidence: number;
};

export type InjectionPageState<TContext> =
  | { kind: "detail-loading" }
  | { kind: "detail-ready"; context: TContext; anchor: AnchorCandidate };

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
    pageState: InjectionPageState<TContext>;
  }): void;
  cleanup?(): void;
};
