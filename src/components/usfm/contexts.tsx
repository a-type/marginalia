import type { BookId, VerseId } from '#/lib/bible/verse';
import { createContext, useContext } from 'react';

export const BookIdContext = createContext<BookId | null>(null);
export function BookIdProvider({
  bookId,
  children,
}: {
  bookId: BookId;
  children: React.ReactNode;
}) {
  return (
    <BookIdContext.Provider value={bookId}>{children}</BookIdContext.Provider>
  );
}
export function useBookId() {
  const bookId = useContext(BookIdContext);
  if (!bookId) {
    throw new Error('useBookId must be used within a BookIdProvider');
  }
  return bookId;
}

export const ChapterNumberContext = createContext<number>(0);
export function ChapterNumberProvider({
  chapterNumber,
  children,
}: {
  chapterNumber: number;
  children: React.ReactNode;
}) {
  return (
    <ChapterNumberContext.Provider value={chapterNumber}>
      {children}
    </ChapterNumberContext.Provider>
  );
}
export function useChapterNumber() {
  const chapterNumber = useContext(ChapterNumberContext);
  if (!chapterNumber) {
    throw new Error(
      'useChapterNumber must be used within a ChapterNumberProvider',
    );
  }
  return chapterNumber;
}

export const VerseIdContext = createContext<VerseId | null>(null);
export function VerseIdProvider({
  verseId,
  children,
}: {
  verseId: VerseId | null;
  children: React.ReactNode;
}) {
  return (
    <VerseIdContext.Provider value={verseId}>
      {children}
    </VerseIdContext.Provider>
  );
}
export function useVerseId() {
  const verseId = useContext(VerseIdContext);
  if (!verseId) {
    throw new Error('useVerseId must be used within a VerseIdProvider');
  }
  return verseId;
}

export interface VerseInteraction {
  isSelected: (verseId: VerseId) => boolean;
  toggle: (verseId: VerseId) => void;
}

const VerseInteractionContext = createContext<VerseInteraction | null>(null);

export function VerseInteractionProvider({
  value,
  children,
}: {
  value: VerseInteraction;
  children: React.ReactNode;
}) {
  return (
    <VerseInteractionContext.Provider value={value}>
      {children}
    </VerseInteractionContext.Provider>
  );
}

export function useOptionalVerseInteraction() {
  return useContext(VerseInteractionContext);
}

export interface VersePresentation {
  active: boolean;
  isAnnotated: (verseId: VerseId) => boolean;
  getVisibility: (verseId: VerseId) => 'visible' | 'ellipsis' | 'hidden';
  renderAfter: (verseId: VerseId) => React.ReactNode;
}

const VersePresentationContext = createContext<VersePresentation | null>(null);

export function VersePresentationProvider({
  value,
  children,
}: {
  value: VersePresentation;
  children: React.ReactNode;
}) {
  return (
    <VersePresentationContext.Provider value={value}>
      {children}
    </VersePresentationContext.Provider>
  );
}

export function useOptionalVersePresentation() {
  return useContext(VersePresentationContext);
}
