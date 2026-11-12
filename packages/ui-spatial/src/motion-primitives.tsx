'use client';

import * as React from 'react';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  type HTMLMotionProps,
  type Variants,
} from 'framer-motion';
import { cn } from '@civora/ui';

export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.035,
      delayChildren: 0.02,
    },
  },
};

export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.24,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

export const tableRowVariants: Variants = {
  hidden: { opacity: 0, y: 5 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

export function SpatialMotionConfig({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export function StaggerSection({
  className,
  children,
  ...props
}: HTMLMotionProps<'section'>) {
  return (
    <motion.section
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className={className}
      {...props}
    >
      {children}
    </motion.section>
  );
}

export function StaggerDiv({
  className,
  children,
  asItem = false,
  ...props
}: HTMLMotionProps<'div'> & { asItem?: boolean }) {
  return (
    <motion.div
      variants={asItem ? staggerItemVariants : staggerContainerVariants}
      initial={asItem ? undefined : 'hidden'}
      animate={asItem ? undefined : 'visible'}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerUl({
  className,
  children,
  asItem = false,
  ...props
}: HTMLMotionProps<'ul'> & { asItem?: boolean }) {
  return (
    <motion.ul
      variants={asItem ? staggerItemVariants : staggerContainerVariants}
      initial={asItem ? undefined : 'hidden'}
      animate={asItem ? undefined : 'visible'}
      className={className}
      {...props}
    >
      {children}
    </motion.ul>
  );
}

export function StaggerLi({
  className,
  children,
  ...props
}: HTMLMotionProps<'li'>) {
  return (
    <motion.li variants={staggerItemVariants} className={className} {...props}>
      {children}
    </motion.li>
  );
}

export function StaggerArticle({
  className,
  children,
  hoverLift = false,
  ...props
}: HTMLMotionProps<'article'> & { hoverLift?: boolean }) {
  return (
    <motion.article
      variants={staggerItemVariants}
      whileHover={hoverLift ? { y: -2 } : undefined}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={className}
      {...props}
    >
      {children}
    </motion.article>
  );
}

export function MotionTableBody({
  className,
  children,
  ...props
}: HTMLMotionProps<'tbody'>) {
  return (
    <motion.tbody
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className={cn(
        'divide-y divide-slate-200/75 dark:divide-slate-800/70',
        className,
      )}
      {...props}
    >
      {children}
    </motion.tbody>
  );
}

export function MotionTableRow({
  className,
  children,
  ...props
}: HTMLMotionProps<'tr'>) {
  return (
    <motion.tr
      variants={tableRowVariants}
      className={cn(
        'group relative transition-colors duration-150 hover:bg-blue-50/55 dark:hover:bg-slate-800/45',
        className,
      )}
      {...props}
    >
      {children}
    </motion.tr>
  );
}

export interface ModalTransitionOverlayProps {
  open: boolean;
  onBackdropClick?: () => void;
  ariaLabel?: string;
  maxWidthClassName?: string;
  children: React.ReactNode;
}

export function ModalTransitionOverlay({
  open,
  onBackdropClick,
  ariaLabel,
  maxWidthClassName = 'max-w-3xl',
  children,
}: ModalTransitionOverlayProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
          onClick={onBackdropClick}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              'relative max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-[#0B1120]',
              maxWidthClassName,
            )}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
