import { m } from '#/paraglide/messages';
import type { TranslationMetadata } from '../../lib/bible/fetch-bible';
import cls from './TranslationAttribution.module.css';

export function TranslationAttribution({
  metadata,
}: {
  metadata?: TranslationMetadata;
}) {
  return (
    <section
      className={cls.root}
      aria-label={m.translation_attribution_license()}
    >
      {metadata ? (
        <>
          {metadata.attribution && (
            <p>
              <span>{m.translation_attribution()}: </span>
              {metadata.attributionUrl ? (
                <a
                  href={metadata.attributionUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {metadata.attribution}
                </a>
              ) : (
                metadata.attribution
              )}
            </p>
          )}
          <p>
            <span>{m.translation_license()}: </span>
            {metadata.licenses.map((license, index) => (
              <span key={license.url}>
                {index > 0 && '; '}
                <a href={license.url} target="_blank" rel="noreferrer">
                  {license.name}
                </a>
              </span>
            ))}
          </p>
          <div className={cls.conditions}>
            {metadata.licenses.some(
              (license) => license.attributionRequired,
            ) && <span>{m.translation_attribution_required()}</span>}
            {metadata.licenses.some((license) => license.shareAlike) && (
              <span>{m.translation_share_alike()}</span>
            )}
            {metadata.licenses.some((license) => license.noDerivatives) && (
              <span>{m.translation_no_derivatives()}</span>
            )}
          </div>
        </>
      ) : (
        <p>{m.translation_license_unknown()}</p>
      )}
    </section>
  );
}
