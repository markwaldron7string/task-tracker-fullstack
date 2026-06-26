import { DestroyRef, Injectable, effect, inject } from '@angular/core';

export interface OverlayLayer {
  contains(target: Node): boolean;
  close(): void;
}

@Injectable({ providedIn: 'root' })
export class OverlayDismissService {
  private layers: OverlayLayer[] = [];
  private listening = false;

  register(layer: OverlayLayer): () => void {
    let entry: OverlayLayer;
    const unregister = () => {
      this.layers = this.layers.filter(item => item !== entry);
    };

    entry = {
      contains: target => layer.contains(target),
      close: () => {
        unregister();
        layer.close();
      },
    };

    this.layers.push(entry);
    this.ensureListener();
    return unregister;
  }

  watch(factory: () => OverlayLayer | null, destroyRef?: DestroyRef): void {
    let unregister: (() => void) | undefined;
    const stop = effect(() => {
      unregister?.();
      unregister = undefined;
      const layer = factory();
      if (layer) unregister = this.register(layer);
    });

    destroyRef?.onDestroy(() => {
      unregister?.();
      stop.destroy();
    });
  }

  private ensureListener(): void {
    if (this.listening || typeof document === 'undefined') return;
    this.listening = true;
    document.addEventListener('mousedown', this.onMouseDown, { capture: true });
  }

  private onMouseDown = (event: MouseEvent): void => {
    const target = event.target as Node;

    while (this.layers.length > 0) {
      const top = this.layers[this.layers.length - 1];
      if (top.contains(target)) return;
      top.close();
    }
  };
}

export function injectOverlayDismissBinding(
  factory: () => OverlayLayer | null
): void {
  const dismiss = inject(OverlayDismissService);
  const destroyRef = inject(DestroyRef);
  dismiss.watch(factory, destroyRef);
}
