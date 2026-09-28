import { createContext } from 'react';

/**
 * The tiles a proposal changes or adds, by tile id, for the dashboard its
 * review draws (T356, AC-341; design 05, pin 4): each is outlined and
 * labelled "Changed" or "New". Empty everywhere else, so nothing is marked
 * outside a review.
 */
export const ReviewMarks = createContext<Readonly<Record<string, 'new' | 'changed'>>>({});
