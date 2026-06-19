/**
 * Type declarations for opencv-wasm
 * Runtime: require('opencv-wasm') => { cv: OpenCVNamespace, cvTranslateError: fn }
 *
 * Uses declaration merging: `const cv` provides runtime value,
 * `namespace cv` provides type annotations. Both merge on import.
 */
declare module "opencv-wasm" {
  // ---- Runtime value type: cv is the OpenCV namespace object ----
  export interface Mat {
    rows: number;
    cols: number;
    type: number;
    data: Uint8Array | Uint8ClampedArray;
    step: number;
    delete(): void;
    isDeleted(): boolean;
    copyTo(dst: Mat): void;
    clone(): Mat;
    convertTo(m: Mat, rtype: number, alpha?: number, beta?: number): void;
    setTo(value: number | number[] | Scalar, mask?: Mat): Mat;
    roi(rect: Rect): Mat;
    elemSize(): number;
    doubleAt(row: number, col: number): number;
  }
  export interface MatConstructor { new (rows?: number, cols?: number, type?: number, initValue?: number[] | number | Scalar): Mat; }
  export interface Size { width: number; height: number; }
  export interface Rect { x: number; y: number; width: number; height: number; }
  export interface Point { x: number; y: number; }
  export interface Scalar { [key: number]: number; }

  export interface OpenCV {
    Mat: MatConstructor;
    Size: new (width: number, height: number) => Size;
    Rect: new (x: number, y: number, width: number, height: number) => Rect;
    Point: new (x: number, y: number) => Point;
    Scalar: new (v0: number, v1?: number, v2?: number, v3?: number) => Scalar;
    resize(src: Mat, dst: Mat, dsize: Size, fx?: number, fy?: number, interpolation?: number): void;
    matchTemplate(image: Mat, templ: Mat, result: Mat, method: number, mask?: Mat): void;
    minMaxLoc(src: Mat, mask?: Mat): { minVal: number; maxVal: number; minLoc: Point; maxLoc: Point };
    cvtColor(src: Mat, dst: Mat, code: number, dstCn?: number): void;
    meanStdDev(src: Mat, mean: Mat, stddev: Mat): void;
    absdiff(src1: Mat, src2: Mat, dst: Mat): void;
    mean(src: Mat, mask?: Mat): Scalar;
    split(m: Mat): Mat[];
    merge(mv: Mat[], dst: Mat): void;
    flip(src: Mat, dst: Mat, flipCode: number): void;
    threshold(src: Mat, dst: Mat, thresh: number, maxval: number, type: number): number;
    rectangle(img: Mat, pt1: Point, pt2: Point, color: Scalar, thickness?: number): void;
    CV_8UC1: number; CV_8UC3: number; CV_8UC4: number; CV_32FC1: number;
    TM_CCOEFF_NORMED: number; TM_CCOEFF: number; TM_CCORR_NORMED: number; TM_SQDIFF_NORMED: number;
    INTER_CUBIC: number; INTER_LINEAR: number; INTER_NEAREST: number; INTER_AREA: number;
    COLOR_RGB2GRAY: number; COLOR_RGBA2GRAY: number; COLOR_GRAY2RGB: number;
    COLOR_GRAY2RGBA: number; COLOR_RGB2RGBA: number; COLOR_RGBA2RGB: number;
    COLOR_BGRA2RGBA: number; COLOR_BGRA2RGB: number; NORM_MINMAX: number;
  }

  export const cv: OpenCV;
  export function cvTranslateError(code: number): string;

  // ---- Type namespace (merged with const above) ----
  // This makes `cv.Mat`, `cv.Size` etc. usable in TYPE positions.
  export namespace cv {
    export { Mat, Size, Rect, Point, Scalar, MatConstructor };
  }
}
