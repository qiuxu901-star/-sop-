const violationCalibrationInsights = [
  "样本校准范围只使用“是否属于违规场景=是”的记录，共 295 条有效标注，其中人工判定已解决 113 条、未解决 182 条。",
  "在违规场景样本中，'已触发违规SOP + 未转人工 + 无重复追问' 是最强已解决模式，出现 111 条人工已解决样本。",
  "在违规场景样本中，'已触发违规SOP + 未转人工 + 有重复追问' 是最强未解决模式，出现 117 条人工未解决样本。",
  "转人工在违规场景中高度偏向未解决，产品当前将其作为前置硬规则，命中即输出未解决 100%。",
  "“再次申诉 / 不认可 / 审核中 / 3个工作日”都不是单向信号，必须结合是否进入正确违规链路、是否还有继续追问一起判断。",
  "“无申诉次数 / 无法申诉 / 超时无法申诉 / 没有申诉机会”是强未解决信号，常见于错误引导或链路缺失。",
  "“没有查询到违规信息”如果出现在判责、扣费、申诉、违规处置等诉求里，往往是场景错配或SOP错触发，应偏未解决。",
  "如果机器人只是告知审核中，但司机后续继续追问进度、数据、原因或处置不认可，人工多数判为未解决。",
  "如果机器人已进入正确违规记录确认链路，并给出当前申诉处理中/审核中的状态，且司机不再继续追问，人工样本中存在较多已解决判例。"
];

const violationFewShotExamples = [
  {
    id: "appeal_in_progress_closed",
    tags: ["再次申诉", "审核中", "违规卡片", "无继续追问"],
    conversationPattern: "司机不认可判责后进入违规记录确认链路，机器人说明申诉处理中、3个工作日内通知，司机在该轮后没有继续追问。",
    manualResult: {
      resolvedStatus: "已解决",
      judgementDirection: "偏向已解决",
      shortConclusion: "已进入正确申诉链路，当前状态说明到位，偏向已解决。"
    },
    reason: "人工样本显示：当违规SOP触发正确、状态说明清楚、司机未继续追问时，即使结果尚未出来，也可判为已解决。"
  },
  {
    id: "triggered_but_repeat_followup",
    tags: ["违规卡片", "重复追问", "处置不认可"],
    conversationPattern: "机器人已经触发违规SOP并给出审核中回复，但司机之后继续追问违规数据、进度、处置不认可或再次表达疑问。",
    manualResult: {
      resolvedStatus: "未解决",
      judgementDirection: "偏向未解决",
      shortConclusion: "虽然进入了违规链路，但司机疑问未闭环，偏向未解决。"
    },
    reason: "人工样本里这是最强未解决模式之一：SOP触发了，但司机仍在继续追问，说明核心疑问没有真正解决。"
  },
  {
    id: "no_appeal_quota",
    tags: ["无申诉次数", "无法申诉", "重复追问"],
    conversationPattern: "司机想申诉或复议，但会话里出现无申诉次数、没有季度次数、无法申诉、超时无法申诉等信息，且机器人仍沿用标准申诉话术。",
    manualResult: {
      resolvedStatus: "未解决",
      judgementDirection: "偏向未解决",
      shortConclusion: "司机无法完成申诉动作，偏向未解决。"
    },
    reason: "人工样本显示，这类会话通常是链路缺失或错误引导，司机虽然有诉求，但实际无法完成下一步。"
  },
  {
    id: "no_violation_info_mismatch",
    tags: ["没有违规信息", "判责", "扣费", "场景错配"],
    conversationPattern: "司机明确在问判责、违规、扣费、申诉相关问题，但机器人回复“没有查询到您有违规信息”或类似兜底话术。",
    manualResult: {
      resolvedStatus: "未解决",
      judgementDirection: "偏向未解决",
      shortConclusion: "机器人回复与诉求错配，偏向未解决。"
    },
    reason: "在违规场景样本里，这类'无违规信息'回复经常意味着识别或SOP匹配错误，而不是司机问题真的被解决。"
  },
  {
    id: "direct_transfer",
    tags: ["转人工", "人工服务"],
    conversationPattern: "司机提出判责相关诉求后，会话中出现转人工、人工服务、正在转接、人工客服等表达。",
    manualResult: {
      resolvedStatus: "未解决",
      judgementDirection: "偏向未解决",
      shortConclusion: "命中转人工，SOP未自主解决。"
    },
    reason: "这是产品硬规则，优先级最高，不再做普通概率加减分。"
  },
  {
    id: "progress_query_answered",
    tags: ["进度查询", "审核中", "无继续追问"],
    conversationPattern: "司机核心问题是申诉进度、审核多久完成、什么时候通知，机器人明确说明审核时效和APP通知方式，且司机不再继续追问。",
    manualResult: {
      resolvedStatus: "已解决",
      judgementDirection: "偏向已解决",
      shortConclusion: "进度问题已被回应，偏向已解决。"
    },
    reason: "当司机问的是进度而非判责依据，明确时效和通知方式往往足以完成当前轮次的SOP解答。"
  },
  {
    id: "progress_query_not_closed",
    tags: ["进度查询", "审核中", "继续追问", "没看到进度"],
    conversationPattern: "机器人说明审核中或3个工作日内通知，但司机继续追问“我没看到进度”“什么时候能看到”“还查不到”等。",
    manualResult: {
      resolvedStatus: "未解决",
      judgementDirection: "偏向未解决",
      shortConclusion: "进度答复未消除司机疑问，偏向未解决。"
    },
    reason: "人工样本显示，进度类答复如果没有真正解决司机的可见性或状态确认问题，仍然会被判未解决。"
  },
  {
    id: "rule_explained_no_followup",
    tags: ["规则解释", "违规原因", "无继续追问"],
    conversationPattern: "司机质疑判责或违规原因，机器人给出明确违规解释、申诉要求或可执行路径，司机后续没有继续追问。",
    manualResult: {
      resolvedStatus: "已解决",
      judgementDirection: "偏向已解决",
      shortConclusion: "核心规则解释已给到，偏向已解决。"
    },
    reason: "这类会话人工通常更看重是否把当前问题讲清楚，而不是是否已经最终改判。"
  }
];

function extractCalibrationTags(conversationText, parsedMessages) {
  const driverText = parsedMessages.filter((message) => message.speaker === "driver").map((message) => message.text).join("\n");
  const botText = parsedMessages.filter((message) => message.speaker === "bot").map((message) => message.text).join("\n");
  const allText = `${conversationText}\n${driverText}\n${botText}`;
  const tags = new Set();

  if (/转人工|人工客服|人工服务|正在转接|转接人工|真人客服|我要人工/.test(allText)) tags.add("转人工");
  if (/再次申诉|不认可|复议|驳回|处罚不认可|处置不认可|判责/.test(driverText)) tags.add("再次申诉");
  if (/审核|3 个工作日|3个工作日|APP|通知|申诉处理中/.test(botText)) tags.add("审核中");
  if (/请确认您要咨询的违规信息|司机选择违规记录|违规卡片/.test(allText)) tags.add("违规卡片");
  if (/没有查询到您有违规信息/.test(botText)) tags.add("没有违规信息");
  if (/无申诉次数|无法申诉|没有季度次数|超时无法申诉/.test(allText)) tags.add("无申诉次数");
  if (/进度|什么时候|多久|没看到进度|什么时候能看到|审核结果/.test(driverText)) tags.add("进度查询");
  if (/规则|原因|依据|影响|为什么|申诉要求|证据/.test(botText)) tags.add("规则解释");
  if (hasRepeatedDriverQuestion(parsedMessages)) tags.add("重复追问");
  if (!hasDriverFollowUpAfterLastBot(parsedMessages)) tags.add("无继续追问");
  if (hasDriverFollowUpAfterLastBot(parsedMessages)) tags.add("继续追问");

  return [...tags];
}

function selectFewShotExamples(conversationText, parsedMessages, limit = 4) {
  const tags = extractCalibrationTags(conversationText, parsedMessages);

  const scored = violationFewShotExamples
    .map((example) => ({
      example,
      score: example.tags.reduce((total, tag) => total + (tags.includes(tag) ? 2 : 0), 0)
    }))
    .sort((left, right) => right.score - left.score);

  const selected = scored.filter((item) => item.score > 0).slice(0, limit).map((item) => item.example);
  if (selected.length >= limit) return selected;

  for (const example of violationFewShotExamples) {
    if (selected.find((item) => item.id === example.id)) continue;
    selected.push(example);
    if (selected.length >= limit) break;
  }

  return selected;
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

module.exports = {
  violationCalibrationInsights,
  violationFewShotExamples,
  selectFewShotExamples
};
