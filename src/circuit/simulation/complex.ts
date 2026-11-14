import type { Complex } from '../types';

export const zero = (): Complex => ({ re: 0, im: 0 });
export const add = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
export const sub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
export const scale = (a: Complex, k: number): Complex => ({ re: a.re * k, im: a.im * k });
export const magnitude = (a: Complex): number => Math.hypot(a.re, a.im);
export const angle = (a: Complex): number => Math.atan2(a.im, a.re) * 180 / Math.PI;
export const polar = (r: number, degrees: number): Complex => ({ re: r * Math.cos(degrees * Math.PI / 180), im: r * Math.sin(degrees * Math.PI / 180) });
export const realPower = (u: Complex, i: Complex): number => u.re * i.re + u.im * i.im;
