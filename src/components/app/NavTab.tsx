import { m } from '#/paraglide/messages';
import { Button, clsx, Icon, Tooltip } from '@a-type/ui';
import { Link } from '@tanstack/react-router';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import cls from './NavTab.module.css';

export interface NavTabProps {
  children?: ReactNode;
  active?: boolean;
  onClose?: () => void;
  onClick?: () => void;
  location: string;
  locationState?: {
    activeReadingTabId?: string;
    skipHomeRestore?: boolean;
  };
  className?: string;
  tooltip: string;
}

export function NavTab({
  children,
  active,
  onClose,
  onClick,
  location,
  className,
  tooltip,
  locationState,
  ...rest
}: NavTabProps) {
  const ref = useRef<any>(null);
  useLayoutEffect(() => {
    if (active && ref.current) {
      ref.current.scrollIntoView({
        block: 'center',
        inline: 'center',
        behavior: 'smooth',
      });
    }
  }, [active]);

  if (!onClose) {
    return (
      <Tooltip content={tooltip}>
        <Button
          size="small"
          className={clsx(cls.root, className)}
          aria-current={active ? 'page' : undefined}
          nativeButton={false}
          ref={ref}
          render={
            <Link to={location} viewTransition state={locationState}>
              {children}
            </Link>
          }
          {...rest}
        />
      </Tooltip>
    );
  }

  return (
    <Tooltip content={tooltip}>
      <div
        className={clsx(cls.root, cls.tabWrapper, className)}
        aria-current={active ? 'page' : undefined}
        ref={ref}
        {...rest}
      >
        <Button
          size="small"
          emphasis="ghost"
          onClick={onClick}
          nativeButton={false}
          render={<Link to={location} viewTransition state={locationState} />}
        >
          {children}
        </Button>
        <Button
          size="small"
          emphasis="ghost"
          onClick={onClose}
          aria-label={m.close_tab()}
        >
          <Icon name="x" />
        </Button>
      </div>
    </Tooltip>
  );
}
