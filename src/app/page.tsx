"use client";

import { useState, useEffect, useCallback, useRef } from 'react';

/* ── Types ─────────────────────────────────────────────────────── */

interface MissingItem {
  rule: string;
  severity: string;
  suggestion: string;
}

interface QaAnswer {
  id: string;
  issueId: string;
  question: string;
  answer: string;
  answeredAt: string;
}

interface ScannedIssue {
  id: string;
  jiraKey: string;
  summary: string;
  description: string;
  assignee: string;
  readinessScore: number;
  status: string;
  missingItems: string;
  questionsGenerated: boolean;
  slackMessageSent: boolean;
  manualOverride: boolean;
  overrideReason: string;
  scannedAt: string;
  updatedAt: string;
  answers: QaAnswer[];
}

type TabKey = 'ALL' | 'READY' | 'NEEDS_INFO' | 'NEEDS_CLARIFICATION' | 'WAITING_ON_SLACK';
type SortKey = 'score' | 'updated' | 'key';

/* ── Helpers ───────────────────────────────────────────────────── */

function parseMissing(raw: string): MissingItem[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    if (arr.length > 0 && typeof arr[0] === 'string') {
      return arr.map((name: string) => ({ rule: name, severity: 'warn', suggestion: '' }));
    }
    return arr;
  } catch { return []; }
}

function severityColor(s: string) {
  if (s === 'error') return 'bg-red-100 text-red-700';
  if (s === 'warn') return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
}

function statusBadge(status: string) {
  const m: Record<string, string> = {
    READY: 'bg-green-100 text-green-800',
    NEEDS_CLARIFICATION: 'bg-yellow-100 text-yellow-800',
    NEEDS_INFO: 'bg-red-100 text-red-800',
    WAITING_ON_SLACK: 'bg-purple-100 text-purple-800',
  };
  return m[status] || 'bg-gray-100 text-gray-800';
}

function scoreColor(s: number, readyThreshold = 4, clarificationThreshold = 2.5) {
  if (s >= readyThreshold) return 'text-green-600 bg-green-50';
  if (s >= clarificationThreshold) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
}

/* ── Toast Component ───────────────────────────────────────────── */

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in">
      <div className="bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-md">
        <span className="text-sm">{message}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
      </div>
    </div>
  );
}

/* ── Issue Detail Drawer ───────────────────────────────────────── */

function IssueDrawer({
  issue,
  onClose,
  onToast,
  onRefresh,
  thresholdReady = 4,
  thresholdClarification = 2.5,
}: {
  issue: ScannedIssue;
  onClose: () => void;
  onToast: (msg: string) => void;
  onRefresh: () => void;
  thresholdReady?: number;
  thresholdClarification?: number;
}) {
  const [questions, setQuestions] = useState<QaAnswer[]>(issue.answers || []);
  const [generating, setGenerating] = useState(false);
  const [sendingSlack, setSendingSlack] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});
  const [savingAnswer, setSavingAnswer] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const missing = parseMissing(issue.missingItems);
  const answeredCount = questions.filter(q => q.answer && q.answer.trim() !== '').length;
  const totalQuestions = questions.length;

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Fetch latest questions on mount
  useEffect(() => {
    if (issue.questionsGenerated) {
      fetch(`/api/questions/answer?issueId=${issue.id}`)
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setQuestions(data); })
        .catch(() => {});
    }
  }, [issue.id, issue.questionsGenerated]);

  const generateQuestions = async (regenerate = false) => {
    setGenerating(true);
    try {
      const res = await fetch('/api/questions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: issue.id, regenerate }),
      });
      const data = await res.json();
      if (data.questions) setQuestions(data.questions);
      onToast(regenerate ? 'Questions regenerated' : 'Questions generated');
      onRefresh();
    } catch { onToast('Error generating questions'); }
    finally { setGenerating(false); }
  };

  const sendToSlack = async () => {
    setSendingSlack(true);
    try {
      const res = await fetch('/api/slack/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: issue.id }),
      });
      const data = await res.json();
      onToast(data.message || 'Sent to Slack');
      // Refresh questions to get mock answers
      const qRes = await fetch(`/api/questions/answer?issueId=${issue.id}`);
      const qData = await qRes.json();
      if (Array.isArray(qData)) setQuestions(qData);
      onRefresh();
    } catch { onToast('Error sending to Slack'); }
    finally { setSendingSlack(false); }
  };

  const submitAnswer = async (qaId: string, question: string) => {
    const answer = answerInputs[qaId];
    if (!answer?.trim()) return;
    setSavingAnswer(qaId);
    try {
      await fetch('/api/questions/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: issue.id, question, answer }),
      });
      // Refresh
      const res = await fetch(`/api/questions/answer?issueId=${issue.id}`);
      const data = await res.json();
      if (Array.isArray(data)) setQuestions(data);
      setAnswerInputs(prev => ({ ...prev, [qaId]: '' }));
      onToast('Answer saved');
    } catch { onToast('Error saving answer'); }
    finally { setSavingAnswer(null); }
  };

  const rescanIssue = async () => {
    setRescanning(true);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: issue.id, projectKey: 'DEMO' }),
      });
      const data = await res.json();
      onToast(data.message || 'Re-scan completed');
      onRefresh();
      onClose();
    } catch { onToast('Error re-scanning issue'); }
    finally { setRescanning(false); }
  };

  const overrideIssue = async () => {
    try {
      await fetch('/api/issues/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId: issue.id,
          manualOverride: true,
          overrideReason,
          newStatus: 'READY',
        }),
      });
      onToast('Issue marked as READY (override)');
      setOverrideOpen(false);
      onRefresh();
      onClose();
    } catch { onToast('Error overriding issue'); }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className="fixed top-0 right-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 overflow-y-auto animate-slide-in-right"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between z-10">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-gray-900">{issue.jiraKey}</span>
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${statusBadge(issue.status)}`}>
                {issue.status.replace(/_/g, ' ')}
              </span>
              {issue.manualOverride && (
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                  OVERRIDE
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-600">{issue.summary}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none p-1">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Score + Meta */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className={`text-2xl font-bold ${scoreColor(issue.readinessScore, thresholdReady, thresholdClarification)} px-2 py-1 rounded`}>
                {issue.readinessScore.toFixed(1)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Score / 5.0</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm font-medium text-gray-900">{issue.assignee || 'Unassigned'}</div>
              <div className="text-xs text-gray-500 mt-1">Assignee</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm font-medium text-gray-900">
                {new Date(issue.scannedAt).toLocaleDateString()}
              </div>
              <div className="text-xs text-gray-500 mt-1">Last Scanned</div>
            </div>
          </div>

          {/* Description */}
          {issue.description && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Description</h4>
              <pre className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto font-sans">
                {issue.description}
              </pre>
            </div>
          )}

          {/* Missing Items */}
          {missing.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2">
                Missing Items ({missing.length})
              </h4>
              <div className="space-y-2">
                {missing.map((m, i) => (
                  <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-lg p-3">
                    <span className={`mt-0.5 px-1.5 py-0.5 text-xs font-medium rounded ${severityColor(m.severity)}`}>
                      {m.severity}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-gray-800">{m.rule}</div>
                      {m.suggestion && <div className="text-xs text-gray-500 mt-0.5">{m.suggestion}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Questions Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-900">
                Clarifying Questions
                {totalQuestions > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    {answeredCount}/{totalQuestions} answered
                  </span>
                )}
              </h4>
              <div className="flex gap-2">
                {!issue.questionsGenerated && issue.status !== 'READY' && (
                  <button
                    onClick={() => generateQuestions(false)}
                    disabled={generating}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:bg-gray-400"
                  >
                    {generating ? 'Generating...' : 'Generate Questions'}
                  </button>
                )}
                {issue.questionsGenerated && (
                  <button
                    onClick={() => generateQuestions(true)}
                    disabled={generating}
                    className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md disabled:text-gray-400"
                  >
                    Regenerate
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {totalQuestions > 0 && (
              <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${(answeredCount / totalQuestions) * 100}%` }}
                />
              </div>
            )}

            {/* Question list */}
            {questions.length > 0 && (
              <div className="space-y-3">
                {questions.map(qa => {
                  const hasAnswer = qa.answer && qa.answer.trim() !== '';
                  const ruleMatch = qa.question.match(/^\[(.+?)\]\s*(.*)/);
                  const ruleName = ruleMatch ? ruleMatch[1] : '';
                  const questionText = ruleMatch ? ruleMatch[2] : qa.question;

                  return (
                    <div key={qa.id} className={`rounded-lg border p-3 ${hasAnswer ? 'border-green-200 bg-green-50/50' : 'border-gray-200'}`}>
                      {ruleName && (
                        <span className="text-xs font-medium text-gray-400">{ruleName}</span>
                      )}
                      <p className="text-sm text-gray-800 mt-0.5">{questionText}</p>

                      {hasAnswer ? (
                        <div className="mt-2 pl-3 border-l-2 border-green-300">
                          <p className="text-sm text-gray-700">{qa.answer}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            Answered {new Date(qa.answeredAt).toLocaleString()}
                          </p>
                        </div>
                      ) : (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            value={answerInputs[qa.id] || ''}
                            onChange={e => setAnswerInputs(prev => ({ ...prev, [qa.id]: e.target.value }))}
                            placeholder="Type your answer..."
                            className="flex-1 text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            onKeyDown={e => { if (e.key === 'Enter') submitAnswer(qa.id, qa.question); }}
                          />
                          <button
                            onClick={() => submitAnswer(qa.id, qa.question)}
                            disabled={savingAnswer === qa.id || !answerInputs[qa.id]?.trim()}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:bg-gray-300"
                          >
                            {savingAnswer === qa.id ? '...' : 'Save'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {totalQuestions === 0 && issue.questionsGenerated && (
              <p className="text-sm text-gray-400 italic">No questions needed — all rules satisfied.</p>
            )}
          </div>

          {/* Slack Section */}
          {issue.questionsGenerated && totalQuestions > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Slack Q&A</h4>
              {!issue.slackMessageSent ? (
                <button
                  onClick={sendToSlack}
                  disabled={sendingSlack}
                  className="w-full px-4 py-2.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md disabled:bg-gray-400 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
                  {sendingSlack ? 'Sending...' : 'Send Questions via Slack'}
                </button>
              ) : (
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center gap-2 text-sm text-green-700 mb-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Slack message sent to {issue.assignee || 'fallback channel'}
                  </div>
                  <p className="text-xs text-gray-500">Answers have been collected and are shown above.</p>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="border-t border-gray-200 pt-4 space-y-3">
            {/* Re-scan */}
            <button
              onClick={rescanIssue}
              disabled={rescanning}
              className="w-full px-4 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:bg-gray-400"
            >
              {rescanning ? 'Re-scanning...' : 'Re-scan Issue'}
            </button>

            {/* Manual Override */}
            {issue.status !== 'READY' && !issue.manualOverride && (
              <>
                {!overrideOpen ? (
                  <button
                    onClick={() => setOverrideOpen(true)}
                    className="w-full px-4 py-2.5 text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-md border border-orange-200"
                  >
                    Mark as READY (Manual Override)
                  </button>
                ) : (
                  <div className="bg-orange-50 rounded-lg p-3 border border-orange-200 space-y-2">
                    <textarea
                      value={overrideReason}
                      onChange={e => setOverrideReason(e.target.value)}
                      placeholder="Reason for override (required)..."
                      rows={2}
                      className="w-full text-sm border border-orange-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={overrideIssue}
                        disabled={!overrideReason.trim()}
                        className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-md disabled:bg-gray-300"
                      >
                        Confirm Override
                      </button>
                      <button
                        onClick={() => setOverrideOpen(false)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white hover:bg-gray-50 rounded-md border border-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {issue.manualOverride && (
              <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                <div className="text-sm font-medium text-orange-800">Manual Override Applied</div>
                <div className="text-xs text-orange-600 mt-1">{issue.overrideReason}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Main Dashboard ────────────────────────────────────────────── */

export default function Home() {
  const [issues, setIssues] = useState<ScannedIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('ALL');
  const [sortBy, setSortBy] = useState<SortKey>('score');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<ScannedIssue | null>(null);
  const [thresholdReady, setThresholdReady] = useState(4);
  const [thresholdClarification, setThresholdClarification] = useState(2.5);

  const fetchThresholds = useCallback(async () => {
    try {
      const res = await fetch('/api/rules');
      if (res.ok) {
        const data = await res.json();
        if (data.thresholdReady !== undefined) setThresholdReady(data.thresholdReady);
        if (data.thresholdClarification !== undefined) setThresholdClarification(data.thresholdClarification);
      }
    } catch {
      // Keep defaults
    }
  }, []);

  const fetchIssues = useCallback(async () => {
    try {
      const res = await fetch('/api/issues');
      const data = await res.json();
      if (Array.isArray(data)) setIssues(data);
    } catch (err) {
    }
  }, []);

  useEffect(() => { fetchIssues(); fetchThresholds(); }, [fetchIssues, fetchThresholds]);

  const loadDemoData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/seed', { method: 'POST' });
      const data = await res.json();
      setToast(data.message || 'Demo data loaded!');
      fetchIssues();
      fetchThresholds();
    } catch { setToast('Error loading demo data'); }
    finally { setLoading(false); }
  };

  const scanIssues = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast(`Scan failed: ${data.error || 'Unknown error'}`);
      } else {
        setToast(data.message || 'Scan completed!');
        fetchIssues();
      }
    } catch (err) {
      setToast('Error scanning issues');
    }
    finally { setScanning(false); }
  };

  const exportData = async (format: 'json' | 'csv') => {
    try {
      const res = await fetch(`/api/export?format=${format}`);
      if (format === 'csv') {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'dor-report.csv';
        a.click();
        URL.revokeObjectURL(url);
        setToast('CSV exported');
      } else {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'dor-report.json';
        a.click();
        URL.revokeObjectURL(url);
        setToast('JSON exported');
      }
    } catch { setToast('Export failed'); }
  };

  // Filter & sort
  const filtered = issues.filter(i => activeTab === 'ALL' || i.status === activeTab);

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'score') cmp = a.readinessScore - b.readinessScore;
    else if (sortBy === 'updated') cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    else cmp = a.jiraKey.localeCompare(b.jiraKey);
    return sortAsc ? cmp : -cmp;
  });

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortAsc(!sortAsc);
    else { setSortBy(key); setSortAsc(false); }
  };

  // Stats
  const stats = {
    total: issues.length,
    ready: issues.filter(i => i.status === 'READY').length,
    needsInfo: issues.filter(i => i.status === 'NEEDS_INFO').length,
    needsClarification: issues.filter(i => i.status === 'NEEDS_CLARIFICATION').length,
    waitingSlack: issues.filter(i => i.status === 'WAITING_ON_SLACK').length,
    avgScore: issues.length > 0 ? issues.reduce((s, i) => s + i.readinessScore, 0) / issues.length : 0,
  };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'ALL', label: 'All', count: stats.total },
    { key: 'READY', label: 'Ready', count: stats.ready },
    { key: 'NEEDS_INFO', label: 'Needs Info', count: stats.needsInfo },
    { key: 'NEEDS_CLARIFICATION', label: 'Needs Clarification', count: stats.needsClarification },
    { key: 'WAITING_ON_SLACK', label: 'Waiting on Slack', count: stats.waitingSlack },
  ];

  return (
    <div className="py-6">
      {toast && <Toast message={toast} onClose={() => setToast('')} />}

      <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <div className="flex gap-2">
            <button
              onClick={loadDemoData}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:bg-gray-400"
            >
              {loading ? 'Loading...' : 'Load Demo Data'}
            </button>
            <button
              onClick={scanIssues}
              disabled={scanning}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:bg-gray-400"
            >
              {scanning ? 'Scanning...' : 'Scan Issues'}
            </button>
            {issues.length > 0 && (
              <div className="relative group">
                <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md">
                  Export
                </button>
                <div className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded-md shadow-lg hidden group-hover:block z-30">
                  <button onClick={() => exportData('csv')} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    Export CSV
                  </button>
                  <button onClick={() => exportData('json')} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    Export JSON
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* Stats Bar */}
        {issues.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow px-4 py-3">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-xs text-gray-500">Total Issues</div>
            </div>
            <div className="bg-white rounded-lg shadow px-4 py-3">
              <div className="text-2xl font-bold text-green-600">{stats.ready}</div>
              <div className="text-xs text-gray-500">Ready</div>
            </div>
            <div className="bg-white rounded-lg shadow px-4 py-3">
              <div className="text-2xl font-bold text-red-600">{stats.needsInfo}</div>
              <div className="text-xs text-gray-500">Needs Info</div>
            </div>
            <div className="bg-white rounded-lg shadow px-4 py-3">
              <div className="text-2xl font-bold text-blue-600">{stats.avgScore.toFixed(1)}</div>
              <div className="text-xs text-gray-500">Avg Score</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        {issues.length > 0 && (
          <div className="border-b border-gray-200 mb-4">
            <nav className="flex gap-6 -mb-px">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                    activeTab === tab.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </nav>
          </div>
        )}

        {/* Issues Table */}
        {sorted.length > 0 ? (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    onClick={() => toggleSort('key')}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  >
                    Issue {sortBy === 'key' && (sortAsc ? '↑' : '↓')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Summary
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assignee
                  </th>
                  <th
                    onClick={() => toggleSort('score')}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  >
                    Score {sortBy === 'score' && (sortAsc ? '↑' : '↓')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Missing
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sorted.map(issue => {
                  const missing = parseMissing(issue.missingItems);
                  return (
                    <tr
                      key={issue.id}
                      onClick={() => setSelectedIssue(issue)}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                        {issue.jiraKey}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate">
                        {issue.summary}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {issue.assignee || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${scoreColor(issue.readinessScore, thresholdReady, thresholdClarification)}`}>
                          {issue.readinessScore.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${statusBadge(issue.status)}`}>
                          {issue.status.replace(/_/g, ' ')}
                        </span>
                        {issue.manualOverride && (
                          <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-orange-100 text-orange-700">OVR</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {missing.slice(0, 3).map((m, i) => (
                            <span key={i} className={`px-1.5 py-0.5 text-xs rounded ${severityColor(m.severity)}`}>
                              {m.rule.replace(/ Present| Defined| Set| Estimated| Documented| Identified/g, '')}
                            </span>
                          ))}
                          {missing.length > 3 && (
                            <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-500">
                              +{missing.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : issues.length === 0 ? (
          <div className="bg-white shadow rounded-lg p-12 text-center">
            <div className="text-4xl mb-4">📋</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Issues Scanned Yet</h3>
            <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
              Click &quot;Load Demo Data&quot; to set up sample settings and rules, then &quot;Scan Issues&quot; to analyze mock Jira issues.
            </p>
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg p-12 text-center">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Issues in This Tab</h3>
            <p className="text-sm text-gray-500">
              No issues match the &quot;{activeTab.replace(/_/g, ' ')}&quot; filter. Try another tab.
            </p>
          </div>
        )}
      </main>

      {/* Drawer */}
      {selectedIssue && (
        <IssueDrawer
          issue={selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onToast={setToast}
          thresholdReady={thresholdReady}
          thresholdClarification={thresholdClarification}
          onRefresh={() => {
            fetchIssues();
            // Refresh selected issue too
            fetch(`/api/issues`)
              .then(r => r.json())
              .then(data => {
                if (Array.isArray(data)) {
                  const updated = data.find((i: ScannedIssue) => i.id === selectedIssue.id);
                  if (updated) setSelectedIssue(updated);
                }
              })
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
