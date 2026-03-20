using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace TagSpecAnalyzer
{
    // --- Models ---

    public class ContextEntry
    {
        public string Key { get; set; } = "";
        public string Value { get; set; } = "";
    }

    public class RegexDetail
    {
        public string LanguageCode { get; set; } = "";
        public string Description { get; set; } = "";
    }

    public enum ComparisonOperator
    {
        None,
        GreaterThan,
        LessThan,
        GreaterThanOrEqual,
        LessThanOrEqual
    }

    public class RuleExpression
    {
        public string SourceField { get; set; } = "";
        public string Regex { get; set; } = "";
        public string? ExpressionPrompt { get; set; }
        public string? ExpressionId { get; set; }
        public List<RegexDetail> RegexDetails { get; set; } = new();

        /// <summary>
        /// When set to anything other than None, the rule uses numeric comparison
        /// instead of regex matching. ComparisonValue holds the threshold.
        /// </summary>
        public ComparisonOperator Operator { get; set; } = ComparisonOperator.None;
        public double? ComparisonValue { get; set; }

        /// <summary>
        /// Parses a RuleExpression from the frontend format where numeric operations
        /// are encoded as __NUMERIC_GT:value, __NUMERIC_LT:value, etc. in the Regex field.
        /// Call this when deserializing from the API/database to populate Operator + ComparisonValue.
        /// </summary>
        public void ParseNumericPrefix()
        {
            var prefixMap = new (string Prefix, ComparisonOperator Op)[]
            {
                ("__NUMERIC_GT:",  ComparisonOperator.GreaterThan),
                ("__NUMERIC_LT:",  ComparisonOperator.LessThan),
                ("__NUMERIC_GTE:", ComparisonOperator.GreaterThanOrEqual),
                ("__NUMERIC_LTE:", ComparisonOperator.LessThanOrEqual),
            };

            foreach (var (prefix, op) in prefixMap)
            {
                if (Regex.StartsWith(prefix))
                {
                    if (double.TryParse(
                        this.Regex.Substring(prefix.Length),
                        NumberStyles.Float,
                        CultureInfo.InvariantCulture,
                        out var val))
                    {
                        Operator = op;
                        ComparisonValue = val;
                    }
                    return;
                }
            }
        }
    }

    public class AttributeRuleExpression
    {
        public string SourceField { get; set; } = "";
        public string Regex { get; set; } = "";
        public string? ExpressionPrompt { get; set; }
        public string? ExpressionId { get; set; }
        public List<RegexDetail> RegexDetails { get; set; } = new();
        public string? VerifyValue { get; set; }
    }

    public class TagAttribute
    {
        public string AttributeTag { get; set; } = "";
        public bool IsMandatory { get; set; }
        public string? LOVTag { get; set; }
        public string ValidationRuleTag { get; set; } = "STRING"; // STRING | NUMBER | DATE
        public AttributeRuleExpression AttributeRuleExpression { get; set; } = new();
    }

    public class TagValidity
    {
        public string? StartDate { get; set; }
        public string? EndDate { get; set; }
    }

    public class TagSpecDefinition
    {
        public string Id { get; set; } = "";
        public List<ContextEntry> Context { get; set; } = new();
        public string Tag { get; set; } = "";
        public string StatusTag { get; set; } = "ACTIVE"; // ACTIVE | INACTIVE | DRAFT | INPROGRESS
        public string CertaintyLevelTag { get; set; } = "HIGH"; // HIGH | MEDIUM | LOW
        public TagValidity Validity { get; set; } = new();

        /// <summary>
        /// Outer list = OR groups, inner list = AND conditions.
        /// Empty = unconditional match.
        /// </summary>
        public List<List<RuleExpression>> TagRuleExpressions { get; set; } = new();

        public List<TagAttribute> Attributes { get; set; } = new();
    }

    public class TagSpecLibrary
    {
        public string? Id { get; set; }
        public string? ActiveTagSpecLibId { get; set; }
        public string OperatorId { get; set; } = "";
        public string StatusTag { get; set; } = "ACTIVE";
        public string DataSetType { get; set; } = "";
        public int Version { get; set; }
        public bool? IsLatestVersion { get; set; }
        public string VersionDate { get; set; } = "";
        public List<ContextEntry> Context { get; set; } = new();
        public List<TagSpecDefinition> TagSpecDefinitions { get; set; } = new();
    }

    public class RowAnalysisResult
    {
        public List<string> Tags { get; set; } = new();
        public Dictionary<string, Dictionary<string, string?>> Attributes { get; set; } = new();
        public List<TagSpecDefinition> MatchedDefinitions { get; set; } = new();
    }

    // --- Analyzer ---

    public static class TransactionAnalyzer
    {
        /// <summary>
        /// Main entry point: checks all tag rules against a transaction row.
        /// Two-level context matching: library context first, then definition context.
        /// Returns matched tags and their extracted attributes.
        /// </summary>
        public static RowAnalysisResult AnalyzeRow(
            Dictionary<string, object?> row,
            List<TagSpecLibrary> libraries)
        {
            var result = new RowAnalysisResult();
            var today = DateTime.UtcNow.ToString("yyyy-MM-dd");

            foreach (var lib in libraries)
            {
                // Level 1: Check parent context (empty = match all, used for preview)
                if (lib.Context.Count > 0 && !ContextMatchesRow(lib.Context, row))
                    continue;

                foreach (var def in lib.TagSpecDefinitions)
                {
                    if (def.StatusTag != "ACTIVE")
                        continue;

                    // Date validity check (ISO string comparison, same as JS)
                    if (!string.IsNullOrEmpty(def.Validity.StartDate) &&
                        string.Compare(today, def.Validity.StartDate, StringComparison.Ordinal) < 0)
                        continue;

                    if (!string.IsNullOrEmpty(def.Validity.EndDate) &&
                        string.Compare(today, def.Validity.EndDate, StringComparison.Ordinal) > 0)
                        continue;

                    // Level 2: Check child context
                    if (def.Context.Count > 0 && !ContextMatchesRow(def.Context, row))
                        continue;

                    // OR logic: any AND group matching is sufficient
                    // Empty rule expressions = unconditional match
                    bool matches = def.TagRuleExpressions.Count == 0 ||
                        def.TagRuleExpressions.Any(andGroup => EvaluateRuleSet(andGroup, row));

                    if (matches)
                    {
                        result.Tags.Add(def.Tag);
                        result.MatchedDefinitions.Add(def);
                        result.Attributes[def.Tag] = ExtractAttributes(def.Attributes, row);
                    }
                }
            }

            return result;
        }

        /// <summary>
        /// Context matching: empty context = wildcard (matches all rows).
        /// All entries must match (AND logic). Fields coerced to string.
        /// Parity: String(row[key] ?? '') === entry.Value
        /// </summary>
        public static bool ContextMatchesRow(List<ContextEntry> context, Dictionary<string, object?> row)
        {
            return context.All(entry =>
            {
                var value = row.TryGetValue(entry.Key, out var v) ? v : null;
                return StringCoerce(value, coerceNull: "") == entry.Value;
            });
        }

        /// <summary>
        /// Evaluates a single AND group against a transaction row.
        /// All conditions must pass. Handles numeric prefix operators first, then regex.
        /// Parity-critical: trims field value before regex test.
        /// </summary>
        public static bool EvaluateRuleSet(List<RuleExpression> andGroup, Dictionary<string, object?> row)
        {
            return andGroup.All(condition =>
            {
                if (!row.TryGetValue(condition.SourceField, out var fieldValue) || fieldValue == null)
                    return false;

                // Numeric comparison via structured Operator field
                if (condition.Operator != ComparisonOperator.None && condition.ComparisonValue.HasValue)
                {
                    if (!double.TryParse(Convert.ToString(fieldValue), NumberStyles.Float,
                        CultureInfo.InvariantCulture, out var numValue))
                        return false;

                    var threshold = condition.ComparisonValue.Value;
                    return condition.Operator switch
                    {
                        ComparisonOperator.GreaterThan        => numValue > threshold,
                        ComparisonOperator.LessThan           => numValue < threshold,
                        ComparisonOperator.GreaterThanOrEqual => numValue >= threshold,
                        ComparisonOperator.LessThanOrEqual    => numValue <= threshold,
                        _ => false
                    };
                }

                // Regex match — TRIMS field value (parity with JS: String(fieldValue).trim())
                try
                {
                    var regex = new Regex(condition.Regex);
                    return regex.IsMatch(Convert.ToString(fieldValue)?.Trim() ?? "");
                }
                catch
                {
                    // Invalid regex → non-match (silent, same as JS)
                    return false;
                }
            });
        }

        /// <summary>
        /// Extracts attribute values from a matched transaction row.
        /// Parity-critical: does NOT trim field value. Uses capture group 1 (not 0).
        /// </summary>
        public static Dictionary<string, string?> ExtractAttributes(
            List<TagAttribute> attributes,
            Dictionary<string, object?> row)
        {
            var result = new Dictionary<string, string?>();

            foreach (var attr in attributes)
            {
                if (!row.TryGetValue(attr.AttributeRuleExpression.SourceField, out var fieldValue) ||
                    fieldValue == null)
                {
                    result[attr.AttributeTag] = null;
                    continue;
                }

                try
                {
                    // NO trim here (parity: String(fieldValue).match(regex) — no trim in JS)
                    var regex = new Regex(attr.AttributeRuleExpression.Regex);
                    var match = regex.Match(Convert.ToString(fieldValue) ?? "");

                    // Capture group 1 (parity: match?.[1] ?? null)
                    result[attr.AttributeTag] = match.Success && match.Groups.Count > 1
                        ? match.Groups[1].Value
                        : null;
                }
                catch
                {
                    // Invalid regex → null (silent, same as JS)
                    result[attr.AttributeTag] = null;
                }
            }

            return result;
        }

        /// <summary>
        /// Coerces a value to string, matching JS String(value ?? fallback) behavior.
        /// </summary>
        private static string StringCoerce(object? value, string coerceNull = "")
        {
            if (value == null) return coerceNull;
            if (value is bool b) return b ? "true" : "false"; // JS: String(true) = "true"
            return Convert.ToString(value) ?? coerceNull;
        }
    }
}
