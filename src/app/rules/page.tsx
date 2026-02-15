"use client";

import { useState, useEffect, useCallback } from 'react';

interface DorRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: string;
  weight: number;
  detectionMethod: string;
  targetField: string;
  expectedPattern: string;
  minLength: number | null;
}

interface Ruleset {
  id: string;
  projectKey: string;
  version: number;
  isActive: boolean;
  thresholdReady: number;
  thresholdClarification: number;
  rules: DorRule[];
}

export default function RulesPage() {
  const [ruleset, setRuleset] = useState<Ruleset | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  // Local state for threshold editing
  const [thresholdReady, setThresholdReady] = useState(4.0);
  const [thresholdClarification, setThresholdClarification] = useState(2.5);
  const [savingThresholds, setSavingThresholds] = useState(false);

  // Local state for weight editing (keyed by ruleId)
  const [editingWeights, setEditingWeights] = useState<Record<string, number>>({});

  const fetchRules = useCallback(async () => {
    try {
      const response = await fetch('/api/rules');
      const data = await response.json();
      if (response.ok) {
        setRuleset(data);
        setThresholdReady(data.thresholdReady ?? 4.0);
        setThresholdClarification(data.thresholdClarification ?? 2.5);
        // Initialize weight edit state
        const weights: Record<string, number> = {};
        for (const rule of data.rules) {
          weights[rule.id] = rule.weight;
        }
        setEditingWeights(weights);
      }
    } catch (error) {
      console.error('Error fetching rules:', error);
      showMessage('Error loading rules', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const showMessage = (msg: string, type: 'success' | 'error' = 'success') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 4000);
  };

  const updateRule = async (ruleId: string, updates: Partial<DorRule>) => {
    setSaving(true);
    setMessage('');

    try {
      const response = await fetch('/api/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId, ...updates }),
      });

      if (!response.ok) {
        const data = await response.json();
        showMessage(data.error || 'Error updating rule', 'error');
        return;
      }

      showMessage('Rule updated successfully');
      fetchRules();
    } catch (error) {
      showMessage('Error updating rule', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = (ruleId: string, enabled: boolean) => {
    updateRule(ruleId, { enabled });
  };

  const handleWeightChange = (ruleId: string, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setEditingWeights(prev => ({ ...prev, [ruleId]: num }));
    }
  };

  const saveWeight = (ruleId: string) => {
    const weight = editingWeights[ruleId];
    if (weight === undefined) return;
    if (weight < 0 || weight > 1) {
      showMessage('Weight must be between 0.0 and 1.0', 'error');
      return;
    }
    updateRule(ruleId, { weight });
  };

  const saveThresholds = async () => {
    if (!ruleset) return;

    // Validate
    if (thresholdReady < 0.1 || thresholdReady > 5.0) {
      showMessage('READY threshold must be between 0.1 and 5.0', 'error');
      return;
    }
    if (thresholdClarification < 0.1 || thresholdClarification > 5.0) {
      showMessage('CLARIFICATION threshold must be between 0.1 and 5.0', 'error');
      return;
    }
    if (thresholdReady <= thresholdClarification) {
      showMessage('READY threshold must be greater than CLARIFICATION threshold', 'error');
      return;
    }

    setSavingThresholds(true);
    setMessage('');
    try {
      const response = await fetch('/api/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rulesetId: ruleset.id,
          thresholdReady,
          thresholdClarification,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        showMessage(data.error || 'Error saving thresholds', 'error');
        return;
      }

      showMessage('Thresholds updated successfully');
      fetchRules();
    } catch (error) {
      showMessage('Error saving thresholds', 'error');
    } finally {
      setSavingThresholds(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      error: 'bg-red-100 text-red-800',
      warn: 'bg-yellow-100 text-yellow-800',
      info: 'bg-blue-100 text-blue-800',
    };
    return colors[severity] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return <div className="py-10 text-center">Loading...</div>;
  }

  if (!ruleset) {
    return <div className="py-10 text-center">No ruleset found. Please load demo data first.</div>;
  }

  const thresholdsDirty =
    thresholdReady !== (ruleset.thresholdReady ?? 4.0) ||
    thresholdClarification !== (ruleset.thresholdClarification ?? 2.5);

  return (
    <div className="py-10">
      <header>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold leading-tight text-gray-900">DoR Rules</h1>
          <p className="mt-2 text-sm text-gray-600">
            Project: {ruleset.projectKey} | Version: {ruleset.version}
          </p>
        </div>
      </header>
      <main>
        <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
          <div className="px-4 py-8 sm:px-0">
            {message && (
              <div className={`mb-4 rounded-md p-4 ${messageType === 'error' ? 'bg-red-50' : 'bg-green-50'}`}>
                <p className={`text-sm ${messageType === 'error' ? 'text-red-800' : 'text-green-800'}`}>{message}</p>
              </div>
            )}

            {/* Rules Section */}
            <div className="bg-white shadow sm:rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Definition of Ready Criteria
                </h3>
                <div className="space-y-4">
                  {ruleset.rules.map((rule) => (
                    <div key={rule.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <input
                              type="checkbox"
                              checked={rule.enabled}
                              onChange={(e) => toggleRule(rule.id, e.target.checked)}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <h4 className="text-md font-medium text-gray-900">{rule.name}</h4>
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getSeverityColor(rule.severity)}`}>
                              {rule.severity}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <label className="text-xs text-gray-500 font-medium">Weight:</label>
                              <input
                                type="number"
                                min="0"
                                max="1"
                                step="0.1"
                                value={editingWeights[rule.id] ?? rule.weight}
                                onChange={(e) => handleWeightChange(rule.id, e.target.value)}
                                className="w-16 text-sm text-gray-900 bg-white border border-gray-300 rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              {editingWeights[rule.id] !== undefined && editingWeights[rule.id] !== rule.weight && (
                                <button
                                  onClick={() => saveWeight(rule.id)}
                                  disabled={saving}
                                  className="px-2 py-0.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:bg-gray-400"
                                >
                                  Save
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-gray-600">{rule.description}</p>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500">
                            <div>
                              <span className="font-medium">Detection:</span> {rule.detectionMethod}
                            </div>
                            <div>
                              <span className="font-medium">Target Field:</span> {rule.targetField}
                            </div>
                            {rule.expectedPattern && (
                              <div className="col-span-2">
                                <span className="font-medium">Pattern:</span> {rule.expectedPattern}
                              </div>
                            )}
                            {rule.minLength && (
                              <div>
                                <span className="font-medium">Min Length:</span> {rule.minLength}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Threshold Editor Section */}
            <div className="mt-8 bg-white shadow sm:rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Status Thresholds
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Configure the score thresholds that determine issue status after scanning.
                  Scores are on a 0-5 scale.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                  {/* Ready Threshold */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <label className="block text-sm font-semibold text-green-800 mb-1">
                      READY Threshold
                    </label>
                    <p className="text-xs text-green-600 mb-2">
                      Issues with score &gt;= this value are marked READY
                    </p>
                    <input
                      type="number"
                      min="0.1"
                      max="5.0"
                      step="0.1"
                      value={thresholdReady}
                      onChange={(e) => setThresholdReady(parseFloat(e.target.value) || 0)}
                      className="w-24 text-lg font-bold text-gray-900 bg-white border border-green-300 rounded-md px-3 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  {/* Clarification Threshold */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <label className="block text-sm font-semibold text-yellow-800 mb-1">
                      NEEDS CLARIFICATION Threshold
                    </label>
                    <p className="text-xs text-yellow-600 mb-2">
                      Issues with score &gt;= this value (but &lt; READY) need clarification
                    </p>
                    <input
                      type="number"
                      min="0.1"
                      max="5.0"
                      step="0.1"
                      value={thresholdClarification}
                      onChange={(e) => setThresholdClarification(parseFloat(e.target.value) || 0)}
                      className="w-24 text-lg font-bold text-gray-900 bg-white border border-yellow-300 rounded-md px-3 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                  </div>
                </div>

                {/* Threshold visual preview */}
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="text-xs font-medium text-gray-500 mb-2">Score Scale Preview</div>
                  <div className="flex items-center gap-0 h-8 rounded-full overflow-hidden border border-gray-200">
                    <div
                      className="bg-red-200 h-full flex items-center justify-center text-xs font-medium text-red-700"
                      style={{ width: `${(thresholdClarification / 5) * 100}%` }}
                    >
                      NEEDS INFO
                    </div>
                    <div
                      className="bg-yellow-200 h-full flex items-center justify-center text-xs font-medium text-yellow-700"
                      style={{ width: `${((thresholdReady - thresholdClarification) / 5) * 100}%` }}
                    >
                      CLARIFICATION
                    </div>
                    <div
                      className="bg-green-200 h-full flex items-center justify-center text-xs font-medium text-green-700"
                      style={{ width: `${((5 - thresholdReady) / 5) * 100}%` }}
                    >
                      READY
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0</span>
                    <span>{thresholdClarification}</span>
                    <span>{thresholdReady}</span>
                    <span>5.0</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={saveThresholds}
                    disabled={savingThresholds || !thresholdsDirty}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {savingThresholds ? 'Saving...' : 'Save Thresholds'}
                  </button>
                  {thresholdsDirty && (
                    <span className="text-xs text-amber-600">Unsaved changes</span>
                  )}
                  {!thresholdsDirty && (
                    <span className="text-xs text-gray-400">No changes</span>
                  )}
                </div>
              </div>
            </div>

            {/* Scoring Info */}
            <div className="mt-8 bg-white shadow sm:rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Scoring Information
                </h3>
                <div className="text-sm text-gray-600 space-y-2">
                  <p>
                    <strong>Readiness Score:</strong> Calculated as weighted average of passed rules (0-5 scale).
                    Each rule&apos;s weight determines its contribution to the final score.
                  </p>
                  <p>
                    <strong>Current Status Thresholds:</strong>
                  </p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li><span className="font-medium text-green-700">READY:</span> Score &gt;= {ruleset.thresholdReady ?? 4.0}</li>
                    <li><span className="font-medium text-yellow-700">NEEDS_CLARIFICATION:</span> Score &gt;= {ruleset.thresholdClarification ?? 2.5}</li>
                    <li><span className="font-medium text-red-700">NEEDS_INFO:</span> Score &lt; {ruleset.thresholdClarification ?? 2.5}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
