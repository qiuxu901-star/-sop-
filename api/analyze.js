const {
  analyzeHardRule,
  buildAnalysisPrompt,
  normalizeAnalysisResult,
  parseConversation,
  parseJsonObject,
  resolveDeepSeekModelName,
  scoreByRules
} = require("./_shared");

module.exports = async (request, response) => {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
    const conversationText = String(body.conversationText || "").trim();

    if (!conversationText) {
      return response.status(400).json({ error: "请输入单条历史会话后再提交分析。" });
    }

    if (conversationText.length > 60000) {
      return response.status(413).json({ error: "单条会话过长，请控制在 60000 字以内。" });
    }

    const parsedMessages = parseConversation(conversationText);
    const hardRuleResult = analyzeHardRule(conversationText, parsedMessages);

    if (hardRuleResult) {
      return response.status(200).json({
        source: "rule",
        parsedMessages,
        ...hardRuleResult
      });
    }

    if (!process.env.DEEPSEEK_API_KEY) {
      return response.status(503).json({
        error: "服务端未配置 DEEPSEEK_API_KEY，当前无法调用 DeepSeek 分析。"
      });
    }

    const ruleResult = scoreByRules(parsedMessages);
    const model = resolveDeepSeekModelName(process.env.DEEPSEEK_MODEL || "deepseek-v4-pro");
    const deepseekResponse = await fetch(`${process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        stream: false,
        max_tokens: 1800,
        messages: [
          {
            role: "system",
            content: "你是客服 SOP 未解决原因分析器。必须先学习规则说明，再按结构化 JSON 输出结论。"
          },
          {
            role: "user",
            content: buildAnalysisPrompt({
              conversationText,
              parsedMessages,
              ruleResult
            })
          }
        ]
      })
    });

    if (!deepseekResponse.ok) {
      const errorText = await deepseekResponse.text();
      return response.status(502).json({
        error: "DeepSeek 调用失败。",
        details: errorText.slice(0, 500)
      });
    }

    const payload = await deepseekResponse.json();
    const content = payload?.choices?.[0]?.message?.content;

    if (!content) {
      return response.status(502).json({ error: "DeepSeek 未返回有效分析结果。" });
    }

    const normalized = normalizeAnalysisResult(parseJsonObject(content), ruleResult);

    return response.status(200).json({
      source: "deepseek",
      parsedMessages,
      ...normalized
    });
  } catch (error) {
    return response.status(500).json({
      error: "分析失败，请检查输入内容或服务配置。",
      details: error instanceof Error ? error.message : "unknown error"
    });
  }
};
