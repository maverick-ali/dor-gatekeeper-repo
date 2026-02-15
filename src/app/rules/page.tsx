"use client";

import { useState, useEffect } from 'react';

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
  rules: DorRule[];
}

export default function RulesPage() {
  const [ruleset, setRuleset] = useState<Ruleset | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      const response = await fetch('/api/rules');
      const data = await response.json();
      if (response.ok) {
        setRuleset(data);
      }
      // else: ruleset stays null, showing "No ruleset found" message
    } catch (error) {
      console.error('Error fetching rules:', error);
      setMessage('Error loading rules');
    } finally {
      setLoading(false);
    }
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

      const data = await response.json();
      setMessage('Rule updated successfully');
      fetchRules();
    } catch (error) {
      setMessage('Error updating rule');
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = (ruleId: string, enabled: boolean) => {
    updateRule(ruleId, { enabled });
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
              <div className="mb-4 rounded-md bg-green-50 p-4">
                <p className="text-sm text-green-800">{message}</p>
              </div>
            )}

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
                          <div className="flex items-center gap-3">
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
                            <span className="text-sm text-gray-500">
                              Weight: {rule.weight}
                            </span>
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

            <div className="mt-8 bg-white shadow sm:rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Scoring Information
                </h3>
                <div className="text-sm text-gray-600 space-y-2">
                  <p>
                    <strong>Readiness Score:</strong> Calculated as weighted average of passed rules (0-5 scale)
                  </p>
                  <p>
                    <strong>Status Thresholds:</strong>
                  </p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>READY: Score &gt;= 4.0</li>
                    <li>NEEDS_CLARIFICATION: Score &gt;= 2.5</li>
                    <li>NEEDS_INFO: Score &lt; 2.5</li>
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
