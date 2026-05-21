const reasonEnum = [
  "【司机】信息缺失不足",
  "【司机】自主操作受阻",
  "【司机】规则/策略解释不足",
  "【司机】场景链路缺失",
  "【司机】个人行为（习惯抓人工）",
  "机器人能力问题"
];

const ruleSummary = `
你必须严格学习并遵守以下规则说明 v1.0，再输出判断：

一、场景边界
1. 当前只分析判责场景。
2. 当前只分析单条人工粘贴的历史会话。
3. 不判断重复进线会话。
4. 不判断重复进线电话。
5. 不输出责任归属。
6. 不做最终业务裁决，不判断是否应改判或赔付。

二、输出结构
必须按以下字段输出：
- resolvedStatus：已解决 / 未解决 / 无法确定
- unresolvedProbability：0-100
- judgementDirection：偏向已解决 / 偏向未解决 / 无法判断
- confidence：高 / 中 / 低
- shortConclusion：一句短结论，不能写长段落
- primaryReason：6类原因之一
- secondaryReasons：最多2个
- reasonJudgements：每个原因都要给 judgement、evidence、suggestion
- evidence：关键证据
- analysisLogic：判断逻辑

三、前置硬规则
如果会话中出现转人工、人工客服、人工服务、接入人工、联系人工、人工坐席、真人客服、我要人工：
- resolvedStatus 固定为 未解决
- unresolvedProbability 固定为 100
- judgementDirection 固定为 偏向未解决
- 原因分类不能只写“转人工”，必须回看转人工前最后一个未闭环诉求做归类

四、解决状态映射
- 0%-30%：已解决，偏向已解决
- 31%-49%：无法确定，偏向已解决
- 50%-69%：无法确定，偏向未解决
- 70%-100%：未解决，偏向未解决
- 未命中硬规则时，概率限制在 5%-95%

五、未解决强信号
- 司机核心诉求未被正面回应
- 司机明确表示不认可、不理解、无法操作、还要申诉或要求人工
- 机器人只给流程性回复，没有解释原因、规则或处理路径
- 司机重复追问同一问题
- SOP 没有正确触发，或触发内容与司机诉求不匹配

六、普通概率加减分
加分项：
- 司机明确不认可/再次申诉/要求复议：+20
- 司机重复追问同一问题：+20
- 机器人未正面回应司机核心诉求：+25
- 只告知审核状态，未解释规则或原因：+20
- 未说明下一步可操作路径：+15
- SOP 未正确触发或内容不匹配：+25
- 司机表达无法操作：+15
- 关键字段缺失导致司机无法理解：+10

减分项：
- 机器人正面回应司机核心诉求：-25
- 回复包含明确规则解释：-20
- 回复给出明确下一步操作路径：-20
- 司机没有继续追问或表达不满：-10
- SOP 正确触发且与诉求匹配：-15
- 司机表达感谢、确认或接受：-20

七、六类原因归类
只能从以下6类里选：
1. 【司机】信息缺失不足
2. 【司机】自主操作受阻
3. 【司机】规则/策略解释不足
4. 【司机】场景链路缺失
5. 【司机】个人行为（习惯抓人工）
6. 机器人能力问题

归类要求：
- 如果司机不知道具体违规原因、审核结果原因、订单/规则信息缺失，优先归 信息缺失不足
- 如果司机知道要做什么，但入口、按钮、材料提交、页面能力阻碍了操作，优先归 自主操作受阻
- 如果司机质疑判责、违规、规则、处置依据、申诉结论，而机器人没解释清楚，优先归 规则/策略解释不足
- 如果司机不知道下一步怎么处理、链路断裂、只被告知等待审核但没有后续动作，优先归 场景链路缺失
- 如果司机没有充分理由却倾向直接抓人工，可以归 个人行为（习惯抓人工）
- 如果是识别、匹配、答非所问、SOP 触发错误，归 机器人能力问题

八、短结论要求
- 先短结论，不要长篇分析
- 必须说明司机核心诉求是否被回应
- 必须方便人工审核对错

九、人工标准
- 人工判断是最终正确标准
- 你输出的是辅助判断，不是最终裁定
`.trim();

function parseConversation(conversationText) {
  const entries = [];
  let current = null;

  for (const rawLine of conversationText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(/^(智能客服|司机)\s*[:：]\s*(.*)$/);
    if (match) {
      if (current) entries.push(current);
      current = {
        speaker: match[1] === "司机" ? "driver" : "bot",
        roleLabel: match[1],
        content: match[2]
      };
      continue;
    }

    if (current) current.content += `\n${line}`;
    else current = { speaker: "unknown", roleLabel: "未知", content: line };
  }

  if (current) entries.push(current);

  return entries.map((entry, index) => {
    const decoded = decodeContent(entry.content);
    const structured = parseJson(decoded);
    const rendered = structured ? renderStructured(structured, decoded) : { type: "plainText", text: decoded.trim() };

    return {
      id: `msg_${index + 1}`,
      speaker: entry.speaker,
      roleLabel: entry.roleLabel,
      messageType: rendered.type,
      rawContent: decoded,
      text: rendered.text
    };
  });
}

function decodeContent(content) {
  const trimmed = content.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function parseJson(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function renderStructured(value, rawContent) {
  const type = typeof value?.type === "string" ? value.type : "unknown";
  const data = isRecord(value?.data) ? value.data : {};

  if (type === "recommendCard") {
    const titles = Array.isArray(data.list)
      ? data.list.map((item) => (isRecord(item) ? safeString(item.title) : "")).filter(Boolean)
      : [];

    return {
      type,
      text: `${safeString(data.tips) || "推荐问题"}${titles.length ? `\n推荐项：${titles.join("；")}` : ""}`
    };
  }

  if (type === "agentCardList") {
    const buttons = Array.isArray(data.buttons)
      ? data.buttons.map((item) => (isRecord(item) ? safeString(item.name) : "")).filter(Boolean)
      : [];
    const cards = Array.isArray(data.cardList)
      ? data.cardList.map((card, index) => renderViolationCard(card, index + 1))
      : [];

    return {
      type,
      text: [safeString(data.content) || "请确认咨询信息", buttons.length ? `可选按钮：${buttons.join("、")}` : "", ...cards]
        .filter(Boolean)
        .join("\n")
    };
  }

  if (type === "violation") {
    const status = data.complaintStatus === 0 ? "申诉处理中" : "已有处理结果";
    return {
      type,
      text: `司机选择违规记录：${safeString(data.disposeReasonName) || "未展示违规原因"}，订单${safeString(data.channelBusinessId) || "未知订单"}，状态：${status}`
    };
  }

  if (type === "imRichText") {
    return {
      type,
      text: safeString(data.content) || compact(rawContent)
    };
  }

  return {
    type: "unknownJson",
    text: `未知结构化消息：${type}\n${compact(rawContent)}`
  };
}

function renderViolationCard(card, index) {
  if (!isRecord(card)) return `违规卡片${index}：未知卡片`;
  const status = card.complaintStatus === 0 ? "申诉处理中" : "已有处理结果";
  return `违规卡片${index}：${safeString(card.disposeReasonName) || "未展示违规原因"}，订单${safeString(card.channelBusinessId) || "未知订单"}，${safeString(card.startAddress) || "起点未知"} 到 ${safeString(card.endAddress) || "终点未知"}，${status}`;
}

function analyzeHardRule(conversationText, parsedMessages) {
  const combined = `${conversationText}\n${parsedMessages.map((message) => message.text).join("\n")}`;
  if (!/转人工|人工客服|人工服务|接入人工|联系人工|人工坐席|真人客服|我要人工/.test(combined)) {
    return null;
  }

  const driverIntent = [...parsedMessages].reverse().find((message) => message.speaker === "driver" && message.text.trim());
  const primaryReason = classifyReason(driverIntent ? driverIntent.text : "");

  return {
    resolvedStatus: "未解决",
    unresolvedProbability: 100,
    judgementDirection: "偏向未解决",
    confidence: "高",
    shortConclusion: "命中转人工，SOP 未自主解决司机问题。",
    primaryReason,
    secondaryReasons: [],
    reasonJudgements: [
      {
        reason: primaryReason,
        judgement: judgementForReason(primaryReason),
        evidence: [
          "会话命中转人工相关表达。",
          driverIntent ? `转人工前司机诉求：${driverIntent.text}` : "转人工前司机诉求不完整。"
        ],
        suggestion: "回看转人工前司机未闭环诉求，补齐 SOP 回答或操作路径。"
      }
    ],
    evidence: ["会话命中转人工相关表达，智能客服 SOP 未完成自主解决。"],
    analysisLogic: [
      "转人工是 MVP 前置硬规则。",
      "命中后直接输出未解决，未解决概率固定为 100%。",
      "原因分类根据转人工前司机核心诉求归类。"
    ]
  };
}

function scoreByRules(parsedMessages) {
  const driverText = parsedMessages.filter((message) => message.speaker === "driver").map((message) => message.text).join("\n");
  const botText = parsedMessages.filter((message) => message.speaker === "bot").map((message) => message.text).join("\n");
  const allText = parsedMessages.map((message) => message.text).join("\n");

  let score = 50;
  const evidence = [];
  const logic = ["默认从 50% 未解决概率开始，根据规则说明 v1.0 做加减分。"];

  const add = (points, reason) => {
    score += points;
    evidence.push(reason);
    logic.push(`+${points}：${reason}`);
  };

  const subtract = (points, reason) => {
    score -= points;
    evidence.push(reason);
    logic.push(`-${points}：${reason}`);
  };

  if (/不认可|再次申诉|复议|申诉|驳回|判责不对|不是故意|严重堵车/.test(driverText)) {
    add(20, "司机表达不认可、再次申诉或复议诉求。");
  }

  if (hasRepeatedDriverQuestion(parsedMessages)) {
    add(20, "司机重复追问同一问题。");
  }

  if (/审核|3 个工作日|3个工作日|关注.*APP|等待/.test(botText) && !/规则|原因|为什么|依据|路径|入口|材料/.test(botText)) {
    add(20, "机器人主要告知审核状态，未充分解释规则、原因或下一步路径。");
  }

  if (/无法|不能|找不到|打不开|提交不了|上传不了/.test(driverText)) {
    add(15, "司机表达无法操作或路径受阻。");
  }

  if (/未展示违规原因|未知订单|缺失|不足/.test(allText)) {
    add(10, "关键字段或上下文信息不足。");
  }

  if (/规则|原因|依据|影响|如何解除|如何申诉|下一步|入口|材料|审核结果/.test(botText)) {
    subtract(20, "机器人提供规则解释或下一步信息。");
  }

  if (/请确认|违规卡片|司机选择违规记录/.test(botText)) {
    subtract(15, "SOP 能识别并触发判责相关结构化卡片。");
  }

  if (!hasDriverFollowUpAfterLastBot(parsedMessages)) {
    subtract(10, "机器人最终回复后司机没有继续追问。");
  }

  const probability = clamp(score, 5, 95);
  const resolvedStatus = probability <= 30 ? "已解决" : probability >= 70 ? "未解决" : "无法确定";
  const judgementDirection = probability <= 49 ? "偏向已解决" : probability >= 50 ? "偏向未解决" : "无法判断";
  const primaryReason = classifyReason(`${driverText}\n${botText}`);

  return {
    resolvedStatus,
    unresolvedProbability: probability,
    judgementDirection,
    confidence: probability >= 70 || probability <= 30 ? "中" : "低",
    shortConclusion:
      resolvedStatus === "未解决"
        ? "司机核心诉求未充分闭环，偏向未解决。"
        : resolvedStatus === "已解决"
          ? "SOP 已回应核心诉求，偏向已解决。"
          : judgementDirection === "偏向未解决"
            ? "证据略偏未解决，需人工复核。"
            : "证据略偏已解决，需人工复核。",
    primaryReason,
    secondaryReasons: [],
    reasonJudgements: [
      {
        reason: primaryReason,
        judgement: judgementForReason(primaryReason),
        evidence: evidence.slice(0, 3),
        suggestion: suggestionForReason(primaryReason)
      }
    ],
    evidence: evidence.slice(0, 6),
    analysisLogic: logic.slice(0, 8)
  };
}

function buildAnalysisPrompt({ conversationText, parsedMessages, ruleResult }) {
  return `
${ruleSummary}

请你基于以上规则说明，对下面这条会话做结构化分析。

补充约束：
1. 先遵守规则说明，再参考本地规则预判。
2. 如果证据不足，不要乱猜，要明确输出 无法确定 或带方向性的偏向判断。
3. 输出必须是 JSON 对象，不能输出 markdown、解释性前后缀或代码块。
4. 主因必须是 6 类原因之一，次因最多 2 个。
5. 短结论必须短，不要长段落。
6. 关键证据必须引用会话里真实出现的内容，不要编造。

本地规则预判：
${JSON.stringify(ruleResult, null, 2)}

对话式解析：
${parsedMessages.map((message) => `${message.roleLabel}：${message.text}`).join("\n")}

原始会话：
${conversationText}
`.trim();
}

function normalizeAnalysisResult(value, fallback) {
  const primaryReason = pickReason(value.primaryReason, fallback.primaryReason) || fallback.primaryReason;

  return {
    resolvedStatus: pickEnum(value.resolvedStatus, ["已解决", "未解决", "无法确定"], fallback.resolvedStatus),
    unresolvedProbability: normalizeProbability(value.unresolvedProbability, fallback.unresolvedProbability),
    judgementDirection: pickEnum(value.judgementDirection, ["偏向已解决", "偏向未解决", "无法判断"], fallback.judgementDirection),
    confidence: pickEnum(value.confidence, ["高", "中", "低"], fallback.confidence),
    shortConclusion: normalizeText(value.shortConclusion, fallback.shortConclusion, 80),
    primaryReason,
    secondaryReasons: Array.isArray(value.secondaryReasons)
      ? value.secondaryReasons.map((reason) => pickReason(reason, null)).filter(Boolean).slice(0, 2)
      : fallback.secondaryReasons,
    reasonJudgements: Array.isArray(value.reasonJudgements)
      ? value.reasonJudgements.slice(0, 3).map((item, index) => ({
          reason: pickReason(item?.reason, index === 0 ? primaryReason : fallback.primaryReason) || fallback.primaryReason,
          judgement: normalizeText(
            item?.judgement,
            fallback.reasonJudgements[index]?.judgement || fallback.reasonJudgements[0]?.judgement || "当前会话证据不足，需人工复核。",
            120
          ),
          evidence: normalizeTextArray(
            item?.evidence,
            fallback.reasonJudgements[index]?.evidence || fallback.evidence,
            3,
            120
          ),
          suggestion: normalizeText(
            item?.suggestion,
            fallback.reasonJudgements[index]?.suggestion || fallback.reasonJudgements[0]?.suggestion || "建议人工复核并补充规则样本。",
            120
          )
        }))
      : fallback.reasonJudgements,
    evidence: normalizeTextArray(value.evidence, fallback.evidence, 6, 120),
    analysisLogic: normalizeTextArray(value.analysisLogic, fallback.analysisLogic, 8, 160)
  };
}

function parseJsonObject(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM 返回内容不是有效 JSON。");
    return JSON.parse(match[0]);
  }
}

function classifyReason(text) {
  const target = text || "";
  if (/人工|真人/.test(target) && !/规则|申诉|违规|判责|原因|无法|找不到/.test(target)) return "【司机】个人行为（习惯抓人工）";
  if (/无法|不能|找不到|打不开|提交不了|上传不了|入口|按钮|页面|操作/.test(target)) return "【司机】自主操作受阻";
  if (/不知道|没说|没看到|查询不到|信息|字段|订单|时间|缺失|不足/.test(target)) return "【司机】信息缺失不足";
  if (/下一步|再次申诉|补充材料|审核|流程|链路|路径|怎么处理/.test(target)) return "【司机】场景链路缺失";
  if (/不认可|违规|判责|处罚|规则|策略|申诉|驳回|扣分|扣钱|为什么|严重堵车|非故意/.test(target)) return "【司机】规则/策略解释不足";
  if (/识别|匹配|答非所问|听不懂|机器人/.test(target)) return "机器人能力问题";
  return "【司机】规则/策略解释不足";
}

function judgementForReason(reason) {
  return {
    "【司机】信息缺失不足": "司机缺少理解判责结果所需的关键信息。",
    "【司机】自主操作受阻": "司机知道诉求方向，但无法完成自助操作。",
    "【司机】规则/策略解释不足": "司机对判责规则、处置依据或申诉结论仍不理解或不认可。",
    "【司机】场景链路缺失": "SOP 没有把当前节点后的处理路径交代清楚。",
    "【司机】个人行为（习惯抓人工）": "司机倾向直接找人工，而非继续自助链路。",
    "机器人能力问题": "机器人识别、匹配或回答能力未覆盖当前诉求。"
  }[reason];
}

function suggestionForReason(reason) {
  return {
    "【司机】信息缺失不足": "补齐违规原因、订单上下文、审核状态和可见字段解释。",
    "【司机】自主操作受阻": "检查入口、按钮、材料提交和页面链路，增加可执行步骤。",
    "【司机】规则/策略解释不足": "补充判责依据、规则口径和司机争议点的解释话术。",
    "【司机】场景链路缺失": "明确当前状态、下一步动作、时间预期和可再次处理路径。",
    "【司机】个人行为（习惯抓人工）": "优化首轮安抚和自助引导，减少直接抓人工的动机。",
    "机器人能力问题": "补充意图识别样本，修正 SOP 触发条件和兜底话术。"
  }[reason];
}

function hasRepeatedDriverQuestion(parsedMessages) {
  const normalized = parsedMessages
    .filter((message) => message.speaker === "driver")
    .map((message) => message.text.replace(/[，。！？!?.,\s]/g, "").slice(0, 24))
    .filter(Boolean);
  return new Set(normalized).size < normalized.length;
}

function hasDriverFollowUpAfterLastBot(parsedMessages) {
  const lastBotIndex = parsedMessages.map((message) => message.speaker).lastIndexOf("bot");
  if (lastBotIndex === -1) return false;
  return parsedMessages.slice(lastBotIndex + 1).some((message) => message.speaker === "driver");
}

function normalizeProbability(value, fallback) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return clamp(Math.round(numberValue), 5, 95);
}

function normalizeText(value, fallback, maxLength) {
  const text = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return text.slice(0, maxLength);
}

function normalizeTextArray(value, fallback, maxItems, maxLength) {
  if (!Array.isArray(value)) return fallback.slice(0, maxItems);
  const normalized = value.map((item) => normalizeText(item, "", maxLength)).filter(Boolean).slice(0, maxItems);
  return normalized.length ? normalized : fallback.slice(0, maxItems);
}

function pickEnum(value, options, fallback) {
  return typeof value === "string" && options.includes(value) ? value : fallback;
}

function pickReason(value, fallback) {
  return typeof value === "string" && reasonEnum.includes(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function compact(text) {
  return String(text || "").replace(/\s+/g, " ").slice(0, 240);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  buildAnalysisPrompt,
  normalizeAnalysisResult,
  parseConversation,
  parseJsonObject,
  analyzeHardRule,
  scoreByRules
};
