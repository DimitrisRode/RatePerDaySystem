import { GoogleGenAI } from "@google/genai";
import { MonthlyAggregation } from "../types";

export const generateDataInsights = async (
  monthlyData: MonthlyAggregation[],
  stationName: string,
  groupName: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Filter out months with no data to save tokens
  const activeMonths = monthlyData.filter(m => m.totalDays > 0);

  // Calculate high-level summary stats from the passed view data
  const totalRev = activeMonths.reduce((acc, m) => acc + m.totalRevenue, 0);
  const totalDays = activeMonths.reduce((acc, m) => acc + m.totalDays, 0);
  const overallAvg = totalDays > 0 ? totalRev / totalDays : 0;

  // Prepare string summary of monthly performance
  const monthSummary = activeMonths.map(m => 
    `- ${m.displayDate}: Avg Rate €${m.avgRate.toFixed(2)} (Rev: €${Math.round(m.totalRevenue)}, Days: ${m.totalDays})`
  ).join("\n");

  const prompt = `
    You are a data analyst expert for a car rental company.
    Analyze the following performance data for:
    - Station: ${stationName}
    - Car Group: ${groupName}

    Global Stats for this selection:
    - Total Revenue: €${totalRev.toFixed(2)}
    - Total Rental Days: ${totalDays}
    - Overall Average Daily Rate: €${overallAvg.toFixed(2)}

    Monthly Breakdown:
    ${monthSummary}

    Task:
    1. Identify the top 3 performing months based on Average Daily Rate.
    2. Identify any significant seasonal trends (e.g. high summer rates vs low winter rates).
    3. Provide a brief recommendation for pricing strategy based on the data.

    Keep the response concise, professional, and formatted in Markdown with bullet points.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "No insights generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Failed to generate insights. Please try again later.";
  }
};