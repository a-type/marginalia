import { Avatar, Box, Button, TextSkeleton } from '@a-type/ui';
import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';

import { m } from '#/paraglide/messages';
import type { listFollowingAnnotationsPage } from '../../lib/annotations/functions';
import { parseVerseId } from '../../lib/bible/verse';
import type { SocialProfile } from '../../lib/social/functions';
import {
  followingAnnotationsQueryOptions,
  profilesForDidsQueryOptions,
} from '../../queries/social';
import { translationBookVersesQueryOptions } from '../../queries/translations';
import { useAddReadingTab } from '../app/readingTabs';
import cls from './FollowingAnnotations.module.css';

type FeedAnnotation = Awaited<
  ReturnType<typeof listFollowingAnnotationsPage>
>['annotations'][number];

export function FollowingAnnotations({
  accountDid,
  translationId,
}: {
  accountDid: string;
  translationId: string;
}) {
  const feed = useInfiniteQuery(followingAnnotationsQueryOptions(accountDid));
  const seen = new Set<string>();
  const pages = feed.data?.pages.map((page) =>
    page.annotations.filter(({ id }) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  );
  const showError = feed.isError && (!feed.data || feed.isFetchNextPageError);

  return (
    <section className={cls.feed} aria-label={m.social_feed_title()}>
      {feed.isPending && (
        <Box>
          <p role="status" className="sr-only">
            {m.social_feed_loading()}
          </p>
          <FeedItemSkeleton />
          <FeedItemSkeleton />
        </Box>
      )}
      {showError && (
        <Box p>
          <p role="alert">{m.social_feed_error()}</p>
        </Box>
      )}
      {!feed.isError && !feed.isPending && !feed.hasNextPage && !seen.size && (
        <Box p>
          <p>{m.social_feed_empty()}</p>
        </Box>
      )}
      {pages?.map((annotations) =>
        annotations.length ? (
          <FeedPage
            key={annotations[0].id}
            annotations={annotations}
            translationId={translationId}
          />
        ) : null,
      )}
      {(feed.hasNextPage || showError) && (
        <Button
          loading={feed.isFetching}
          onClick={() => {
            if (feed.data) void feed.fetchNextPage();
            else void feed.refetch();
          }}
        >
          {showError ? m.social_feed_retry() : m.social_feed_load_more()}
        </Button>
      )}
    </section>
  );
}

function FeedPage({
  annotations,
  translationId,
}: {
  annotations: FeedAnnotation[];
  translationId: string;
}) {
  const { data: profiles } = useQuery(
    profilesForDidsQueryOptions(annotations.map(({ authorDid }) => authorDid)),
  );
  const byDid = new Map(
    profiles?.map((profile) => [profile.authorDid, profile]),
  );
  return annotations.map((annotation) => (
    <AnnotationPost
      key={annotation.id}
      annotation={annotation}
      profile={byDid.get(annotation.authorDid)}
      translationId={translationId}
    />
  ));
}

function AnnotationPost({
  annotation,
  profile,
  translationId,
}: {
  annotation: FeedAnnotation;
  profile?: SocialProfile;
  translationId: string;
}) {
  const addReadingTab = useAddReadingTab();
  const bookIds = [
    ...new Set(annotation.verses.map((id) => parseVerseId(id).bookId)),
  ];
  const books = useQueries({
    queries: bookIds.map((id) =>
      translationBookVersesQueryOptions(translationId, id),
    ),
  });
  const ids = new Set(annotation.verses);
  const matches = new Map(
    books.flatMap(({ data }) =>
      data?.available
        ? data.verses
            .filter(({ id }) => ids.has(id))
            .map(({ id, text }) => [id, text] as const)
        : [],
    ),
  );
  const verses = annotation.verses.filter((id) => matches.has(id));
  const excerpt = verses.map((id) => matches.get(id)).join(' ');
  const handle = profile ? `@${profile.handle}` : annotation.authorDid;

  return (
    <article className={cls.post}>
      <header className={cls.author}>
        <Avatar
          aria-hidden="true"
          name={profile?.handle}
          imageSrc={profile?.avatar}
        />
        <strong>{handle}</strong>
      </header>
      <div>
        <blockquote className={`${cls.excerpt} ${cls.verse} @mode-dense`}>
          {excerpt ||
            (books.some(({ isPending }) => isPending)
              ? m.social_feed_verse_loading()
              : m.social_feed_verse_unavailable())}
        </blockquote>
        <p className={`${cls.excerpt} ${cls.annotation}`}>
          {annotation.comment}
        </p>
      </div>
      <footer>
        <Button
          size="small"
          disabled={!verses.length}
          aria-label={m.social_feed_open_by({ handle })}
          onClick={() => {
            const first = verses.at(0);
            if (!first) return;
            const { bookId, chapter } = parseVerseId(first);
            addReadingTab({
              translation: translationId,
              book: bookId,
              chapter,
              verses: verses.join(','),
              annotation: annotation.id,
            });
          }}
        >
          {m.social_feed_open()}
        </Button>
      </footer>
    </article>
  );
}

function FeedItemSkeleton() {
  return (
    <article className={cls.post}>
      <header className={cls.author}>
        <Avatar aria-hidden="true" name="" />
        <strong>
          <TextSkeleton maxLength={20} />
        </strong>
      </header>
      <div>
        <blockquote className={`${cls.excerpt} ${cls.verse} @mode-dense`}>
          <TextSkeleton maxLength={100} />
        </blockquote>
        <p className={`${cls.excerpt} ${cls.annotation}`}>
          <TextSkeleton maxLength={50} />
        </p>
      </div>
    </article>
  );
}
