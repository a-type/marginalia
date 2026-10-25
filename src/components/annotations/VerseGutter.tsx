import { Avatar, Box, Button, Chip, clsx } from '@a-type/ui';
import { useQuery } from '@tanstack/react-query';

import type { VerseId } from '#/lib/bible/verse';
import { formatVerseAnchorName, parseVerseId } from '#/lib/bible/verse';
import type { SocialProfile } from '#/lib/social/functions';
import { profilesForDidsQueryOptions } from '#/queries/social';
import { currentUserDidQueryOptions } from '#/queries/user';
import { useSetSelectedVerseNumber } from './annotationPaneStore';
import type { AnnotationWithVerses } from './useChapterAnnotations';
import cls from './VerseGutter.module.css';

export interface VerseGutterProps {
  annotations: readonly AnnotationWithVerses[];
}

export function VerseGutter({ annotations }: VerseGutterProps) {
  const setSelectedVerseNumber = useSetSelectedVerseNumber();
  const userDidQuery = useQuery({
    ...currentUserDidQueryOptions,
    enabled: typeof window !== 'undefined',
  });
  const accountDid = userDidQuery.data ?? null;
  const annotationsByVerse = annotations.reduce((groups, annotation) => {
    for (const verseId of annotation.verses) {
      const group = groups.get(verseId) ?? [];
      group.push(annotation);
      groups.set(verseId, group);
    }
    return groups;
  }, new Map<VerseId, AnnotationWithVerses[]>());
  const authorDids = [
    ...new Set(
      annotations.flatMap((annotation) =>
        annotation.authorDid ? [annotation.authorDid] : [],
      ),
    ),
  ].sort();
  const authorProfilesQuery = useQuery({
    ...profilesForDidsQueryOptions(authorDids),
    enabled: Boolean(accountDid && authorDids.length),
  });
  const authorProfiles = new Map(
    (authorProfilesQuery.data ?? []).map((profile) => [
      profile.authorDid,
      profile,
    ]),
  );

  return (
    <div className={cls.gutter}>
      {[...annotationsByVerse].map(([verseId, verseAnnotations]) => (
        <Button
          emphasis="unstyled"
          size="wrapper"
          key={verseId}
          className={cls.indicators}
          style={{ positionAnchor: formatVerseAnchorName(verseId) }}
          aria-label={`Open ${verseAnnotations.length} annotations`}
          onClick={() =>
            setSelectedVerseNumber(
              parseVerseId(verseId).verse,
              verseAnnotations[0]?.id,
            )
          }
        >
          <span className={cls.dots} aria-hidden="true">
            {verseAnnotations.map((annotation) => (
              <AnnotationDot
                key={annotation.id}
                authorProfile={
                  accountDid
                    ? authorProfiles.get(annotation.authorDid ?? '')
                    : undefined
                }
                isLocalUser={annotation.authorDid === accountDid}
              />
            ))}
          </span>
          <span className={cls.excerpts} aria-hidden="true">
            {verseAnnotations.map((annotation) => (
              <AnnotationExcerpt
                key={annotation.id}
                annotation={annotation}
                authorProfile={authorProfiles.get(annotation.authorDid ?? '')}
                showAuthor={Boolean(accountDid)}
                isLocalUser={annotation.authorDid === accountDid}
              />
            ))}
          </span>
        </Button>
      ))}
    </div>
  );
}

function AnnotationExcerpt({
  annotation,
  authorProfile,
  showAuthor,
  isLocalUser,
}: {
  annotation: AnnotationWithVerses;
  authorProfile: SocialProfile | undefined;
  showAuthor: boolean;
  isLocalUser: boolean;
}) {
  return (
    <Box
      gap
      items="center"
      className={clsx(
        '@mode-denser',
        isLocalUser ? '@mode-tomato' : '@mode-neutral',
      )}
    >
      <Chip className={cls.excerpt}>
        <span className={cls.excerptReference}>
          {referenceVerseRange(annotation.verses)}
        </span>
        <span className={cls.excerptText}>{annotation.comment}</span>
      </Chip>
      {showAuthor ? <AuthorAvatar profile={authorProfile} /> : null}
    </Box>
  );
}

function AuthorAvatar({
  profile,
  size = '15px',
}: {
  profile: SocialProfile | undefined;
  size?: string;
}) {
  return (
    <Avatar
      className={clsx(cls.authorAvatar)}
      aria-hidden="true"
      name={profile?.displayName ?? profile?.handle ?? 'Author'}
      imageSrc={profile?.avatar}
      size={size}
    />
  );
}

function AnnotationDot({
  authorProfile,
  isLocalUser,
}: {
  authorProfile?: SocialProfile;
  isLocalUser: boolean;
}) {
  if (authorProfile) {
    return <AuthorAvatar profile={authorProfile} size="12px" />;
  }
  return (
    <span
      className={clsx(
        cls.indicator,
        isLocalUser ? '@mode-tomato' : '@mode-neutral',
      )}
    />
  );
}

// extract chapter:verse number pair for start and end, if
// range, format as A:B-C:D, otherwise A:B
function referenceVerseRange(verses: readonly VerseId[]) {
  if (verses.length === 0) return '';
  const start = parseVerseId(verses[0]);
  const end = parseVerseId(verses[verses.length - 1]);
  if (start.chapter === end.chapter && start.verse === end.verse) {
    return `${start.chapter}:${start.verse}`;
  }
  return `${start.chapter}:${start.verse}-${end.chapter}:${end.verse}`;
}
