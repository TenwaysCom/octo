import { useEffect } from "react";
import { mountWeKnoraWidget } from "../lib/weknora-widget.js";

export function WeKnoraWidget({ apiBaseUrl }) {
  useEffect(() => mountWeKnoraWidget({ apiBaseUrl }), [apiBaseUrl]);
  return null;
}
