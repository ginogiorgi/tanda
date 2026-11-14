import { Component, type ReactNode } from "react";

/**
 * Error boundary mínimo para la carga de GLB: `useLoader` tira un error (no una promesa) si el GLB
 * falla (red, 404, decoder) y Suspense no lo ataja → sin esto se cae todo el canvas. Muestra
 * `fallback` (el avatar procedural, o nada en la precarga).
 */
export class ErrorFallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
