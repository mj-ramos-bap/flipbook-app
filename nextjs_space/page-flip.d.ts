declare module "page-flip" {
  export interface PageFlipSettings {
    width: number;
    height: number;
    size?: "fixed" | "stretch";
    drawShadow?: boolean;
    flippingTime?: number;
    usePortrait?: boolean;
    startZIndex?: number;
    maxShadowOpacity?: number;
    showCover?: boolean;
    mobileScrollSupport?: boolean;
    clickEventForward?: boolean;
    useMouseEvents?: boolean;
    swipeDistance?: number;
    showPageCorners?: boolean;
    disableFlipByClick?: boolean;
    [key: string]: unknown;
  }

  export class PageFlip {
    constructor(el: HTMLElement, settings: PageFlipSettings);
    loadFromHTML(items: HTMLElement[] | NodeListOf<HTMLElement>): void;
    flip(pageIndex: number, corner?: string): void;
    flipNext(corner?: string): void;
    flipPrev(corner?: string): void;
    getCurrentPageIndex(): number;
    turnToPage(pageIndex: number): void;
    destroy(): void;
    on(event: string, callback: (e: { data: unknown }) => void): this;
    off(event: string): this;
  }
}
