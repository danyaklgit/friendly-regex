import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientSyncCurrentView, ClientSyncDisplayedCustomer, ClientSyncKbMatch, ClientSyncMatchParty, LabeledKeyValue } from '../../api/clientSync';
import { DASH } from '../../utils/clientSync/format';
import { formatCount } from '../../utils/reports/format';
import {
  findParty, levelKey, matchHasUnknownKey, matchLevelTitle, partyIndents, summaryParty, summaryPartyText,
} from '../../utils/clientSync/holdsNow';
import { Badge } from '../shared/Badge';
import { Button } from '../shared/Button';
import { KvList } from './KvList';
import { CertaintyPill } from './StatusBadges';

/**
 * "What BwaTech holds now" grouped by meaning (UI_ClientSync_HoldsNowGrouped):
 * TEP's own attributes, the customer the knowledge base displays, then one
 * card per knowledge-base match split into its parties. Nothing is filtered:
 * every list the backend sends is rendered in full, unknown keys included.
 */

const UNKNOWN_KEY_CLASS = 'text-amber-700 dark:text-amber-300';
const INDENT_CLASS = ['', 'ml-5', 'ml-10'];
const UNKNOWN_KEY_NOTE = 'A key the layout does not know yet: it has no label, but its key and value are shown in full, in its own match.';

interface FlashTarget { key: string; nonce: number }

function isBlank(value: string | null): boolean {
  return value === null || value.trim() === '';
}
function partyKey(matchNumber: number, level: string): string {
  return `${matchNumber}:${levelKey(level)}`;
}
function matchKey(matchNumber: number): string {
  return `${matchNumber}:`;
}

/** Label | Value | Key rows. A key the layout does not know gets a dash for its label and an amber key. */
function LabeledRows({ items, label }: { items: readonly LabeledKeyValue[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <dl
      role="list"
      aria-label={label}
      className="grid grid-cols-[minmax(5rem,max-content)_minmax(0,1fr)] gap-x-4 gap-y-px text-xs sm:grid-cols-[minmax(5rem,max-content)_minmax(0,1fr)_minmax(0,16rem)]"
    >
      {items.map((item, index) => {
        const unknown = item.Label === null;
        return (
          // One subgrid row per attribute so the hover tint spans every cell; the key wraps under the value when narrow.
          <div key={`${item.Key}-${index}`} className="col-span-2 grid grid-cols-subgrid rounded px-1.5 py-0.5 hover:bg-surface-hover sm:col-span-3">
            <dt className="text-muted">{item.Label ?? DASH}</dt>
            <dd className="break-words text-body" dir="auto">
              {isBlank(item.Value) ? <span className="text-muted">{DASH}</span> : item.Value}
            </dd>
            <dd className={`col-start-2 truncate font-mono text-[11px] sm:col-start-auto sm:text-right ${unknown ? UNKNOWN_KEY_CLASS : 'text-muted'}`} title={item.Key}>
              {item.Key}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

interface DisplayedCardProps {
  displayed: ClientSyncDisplayedCustomer;
  matches: readonly ClientSyncKbMatch[];
  onGoToMatch: (matchNumber: number, level: string | null) => void;
}

function DisplayedCard({ displayed, matches, onGoToMatch }: DisplayedCardProps) {
  const matchNumber = displayed.MatchNumber;
  const levelTitle = matchNumber === null ? null : matchLevelTitle(matches, matchNumber, displayed.MatchLevel);
  return (
    <section aria-label="Displayed customer" className="space-y-1.5 rounded-lg border-2 border-primary/40 bg-primary/5 px-3 py-2">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Displayed customer</div>
          <div className="text-sm font-semibold text-heading" dir="auto">{displayed.NameEn ?? displayed.Code ?? DASH}</div>
          {displayed.NameAr && <div className="text-xs text-body-secondary" dir="auto">{displayed.NameAr}</div>}
        </div>
        {(displayed.HierarchyLevel || displayed.CustomerType) && (
          <div className="flex items-center gap-1">
            {displayed.HierarchyLevel && <Badge variant="gray" size="xs">{displayed.HierarchyLevel}</Badge>}
            {displayed.CustomerType && <Badge variant="gray" size="xs">{displayed.CustomerType}</Badge>}
          </div>
        )}
      </div>
      {matchNumber !== null && (
        <p className="text-[11px] text-muted">
          {displayed.Code && <><span className="font-mono">{displayed.Code}</span>{' · '}</>}
          {'is '}
          <button type="button" className="underline hover:text-body" onClick={() => onGoToMatch(matchNumber, displayed.MatchLevel)}>
            {levelTitle ? `match #${matchNumber} · ${levelTitle}` : `match #${matchNumber}`}
          </button>
        </p>
      )}
      <LabeledRows label="Displayed customer attributes" items={displayed.Attributes} />
    </section>
  );
}

interface PartyBlockProps {
  party: ClientSyncMatchParty;
  indent: number;
  flashing: boolean;
  onFlashEnd: () => void;
  partyRef: (el: HTMLDivElement | null) => void;
}

function PartyBlock({ party, indent, flashing, onFlashEnd, partyRef }: PartyBlockProps) {
  const indentClass = INDENT_CLASS[Math.min(indent, INDENT_CLASS.length - 1)];
  return (
    <div
      ref={partyRef}
      aria-label={party.Title}
      onAnimationEnd={flashing ? onFlashEnd : undefined}
      className={`rounded-md ${indentClass} ${party.IsDisplayed ? 'bg-primary/5 px-2 py-1.5 ring-1 ring-primary/20' : ''} ${flashing ? 'tep-col-flash' : ''}`}
    >
      <div className="mb-0.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-heading">
        {indent > 0 && <span aria-hidden className="font-mono text-muted">└</span>}
        <span>{party.Title}</span>
        {party.CustomerType && <Badge variant="gray" size="xs">{party.CustomerType}</Badge>}
        {party.IsDisplayed && <Badge variant="info" size="xs">Displayed</Badge>}
      </div>
      <LabeledRows label={`${party.Title} attributes`} items={party.Attributes} />
    </div>
  );
}

interface MatchCardProps {
  match: ClientSyncKbMatch;
  collapsed: boolean;
  onToggle: () => void;
  flash: FlashTarget | null;
  onFlashEnd: () => void;
  registerTarget: (key: string, el: HTMLElement | null) => void;
}

function MatchCard({ match, collapsed, onToggle, flash, onFlashEnd, registerTarget }: MatchCardProps) {
  const summary = summaryParty(match);
  const indents = partyIndents(match.Parties);
  const panelId = `holds-now-match-${match.Number}`;
  // The card itself flashes when the displayed customer points at a match whose party cannot be found.
  const cardFlashing = flash !== null && flash.key === matchKey(match.Number);
  return (
    <section
      aria-label={`Match #${match.Number}`}
      ref={(el) => registerTarget(matchKey(match.Number), el)}
      onAnimationEnd={cardFlashing ? onFlashEnd : undefined}
      className={`rounded-lg border border-border ${cardFlashing ? 'tep-col-flash' : ''}`}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-surface-hover"
      >
        <span aria-hidden className="w-3 text-[10px] text-muted">{collapsed ? '▸' : '▾'}</span>
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-slate-200 dark:text-slate-900">{`#${match.Number}`}</span>
        <span className="rounded bg-surface-tertiary px-1.5 py-0.5 font-mono text-[10px] text-body-secondary">{match.Suffix || 'no suffix'}</span>
        {collapsed && summary && <span className="min-w-0 truncate text-xs text-body">{summaryPartyText(summary)}</span>}
        <span className="ml-auto flex items-center gap-1">
          {match.CustomerType && <Badge variant="gray" size="xs">{match.CustomerType}</Badge>}
          <CertaintyPill certainty={match.Certainty} rank={match.CertaintyRank} />
        </span>
      </button>
      {!collapsed && (
        <div id={panelId} className="space-y-2 border-t border-border px-3 py-2">
          {match.Parties.map((party, index) => {
            const key = partyKey(match.Number, party.Level);
            const flashing = flash !== null && flash.key === key;
            return (
              // The nonce in the key remounts a re-targeted party so its flash animation restarts.
              <PartyBlock
                key={`${key}-${index}-${flashing ? flash.nonce : 0}`}
                party={party}
                indent={indents[index]}
                flashing={flashing}
                onFlashEnd={onFlashEnd}
                partyRef={(el) => registerTarget(key, el)}
              />
            );
          })}
          {match.Fields.length > 0 && (
            <div className={match.Parties.length > 0 ? 'border-t border-dashed border-border pt-2' : ''}>
              <LabeledRows label={`Match #${match.Number} fields`} items={match.Fields} />
            </div>
          )}
          {matchHasUnknownKey(match) && <p className={`text-[11px] italic ${UNKNOWN_KEY_CLASS}`}>{UNKNOWN_KEY_NOTE}</p>}
        </div>
      )}
    </section>
  );
}

interface HoldsNowGroupedProps {
  view: ClientSyncCurrentView;
}

export function HoldsNowGrouped({ view }: HoldsNowGroupedProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());
  const [flash, setFlash] = useState<FlashTarget | null>(null);
  // Another row's trace starts fully expanded with no flash (render-time adjustment, no extra effect pass).
  const [prevView, setPrevView] = useState(view);
  if (view !== prevView) {
    setPrevView(view);
    setCollapsed(new Set());
    setFlash(null);
  }

  const targets = useRef(new Map<string, HTMLElement>());
  const registerTarget = useCallback((key: string, el: HTMLElement | null) => {
    if (el) targets.current.set(key, el);
    else targets.current.delete(key);
  }, []);

  const matches = view.Matches;
  const anyExpanded = matches.some((m) => !collapsed.has(m.Number));
  const toggleAll = () => setCollapsed(anyExpanded ? new Set(matches.map((m) => m.Number)) : new Set());
  const toggleOne = (matchNumber: number) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(matchNumber)) next.delete(matchNumber);
    else next.add(matchNumber);
    return next;
  });

  // From the Displayed card: expand the match, then scroll to and flash the party that carries the code.
  const goToMatch = useCallback((matchNumber: number, level: string | null) => {
    const party = findParty(matches.find((m) => m.Number === matchNumber), level);
    setCollapsed((prev) => {
      if (!prev.has(matchNumber)) return prev;
      const next = new Set(prev);
      next.delete(matchNumber);
      return next;
    });
    setFlash((prev) => ({ key: party ? partyKey(matchNumber, party.Level) : matchKey(matchNumber), nonce: (prev?.nonce ?? 0) + 1 }));
  }, [matches]);
  const endFlash = useCallback(() => setFlash(null), []);
  useEffect(() => {
    if (!flash) return;
    targets.current.get(flash.key)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [flash]);

  if (view.Tep.length === 0 && view.Displayed === null && matches.length === 0) {
    return <p className="text-xs text-muted">No attributes held</p>;
  }

  return (
    <div className="space-y-2">
      {view.Tep.length > 0 && (
        <section aria-label="TEP attributes" className="space-y-1 rounded-lg border border-border px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-xs font-semibold text-heading">TEP attributes</span>
            <span className="text-[11px] text-muted">{formatCount(view.Tep.length)}</span>
            <span className="ml-auto text-[11px] italic text-muted">every key that does not start kb_</span>
          </div>
          <KvList items={view.Tep.map((a) => ({ key: a.Key, value: a.Value }))} />
        </section>
      )}
      {view.Displayed && <DisplayedCard displayed={view.Displayed} matches={matches} onGoToMatch={goToMatch} />}
      {matches.length > 0 && (
        <section aria-label="Knowledge-base matches" className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">Knowledge-base matches</span>
            <span className="text-[11px] text-muted">{formatCount(matches.length)}</span>
            <div className="ml-auto">
              <Button variant="outline" size="xs" onClick={toggleAll}>{anyExpanded ? 'Collapse all' : 'Expand all'}</Button>
            </div>
          </div>
          {matches.map((match) => (
            <MatchCard
              key={match.Number}
              match={match}
              collapsed={collapsed.has(match.Number)}
              onToggle={() => toggleOne(match.Number)}
              flash={flash}
              onFlashEnd={endFlash}
              registerTarget={registerTarget}
            />
          ))}
        </section>
      )}
    </div>
  );
}
