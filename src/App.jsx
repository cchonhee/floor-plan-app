import React, { useState, useRef, useEffect } from "react";
import {
  Image as ImageIcon,
  Download,
  AlertCircle,
  Loader2,
  Camera,
  UploadCloud,
  Frame,
} from "lucide-react";

export default function App() {
  const [imageSrc, setImageSrc] = useState(null);
  const [base64Data, setBase64Data] = useState(null);
  const [imageMimeType, setImageMimeType] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState("");

  const canvasRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드 가능합니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      setImageSrc(dataUrl);

      const base64 = dataUrl.split(",")[1];
      setBase64Data(base64);
      setImageMimeType(file.type);
      setAnalysisResult(null);
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async () => {
    if (!base64Data) {
      setError("도면 이미지를 업로드해주세요.");
      return;
    }

    setIsProcessing(true);
    setError("");

    let finalApiKey = "";

    try {
      if (
        typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_GEMINI_API_KEY
      ) {
        finalApiKey = import.meta.env.VITE_GEMINI_API_KEY;
      }
    } catch (e) {
      console.warn("환경 변수를 불러오지 못했습니다.", e);
    }

    if (!finalApiKey) {
      setError(
        "API 키가 없습니다. 버셀(Vercel) 환경 변수 세팅을 확인해 주세요.",
      );
      setIsProcessing(false);
      return;
    }

    // 💡 [핵심 업데이트] AI의 환각을 막기 위해 16개 좌표 대신, 선 중앙을 관통하는 4개(xMin, xMax, yMin, yMax)의 사각형 박스 좌표만 추출하도록 프롬프트를 전면 수정했습니다.
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `다음은 건축 평면도 이미지야. 다중 도면이 있다면 모두 독립적으로 분석해.\n\n**[앱의 핵심 목적]**\n방을 둘러싼 붉은선(외곽선)과 검은선(내부 구획선)의 길이 수치를 표시해야 해. 치수보조선은 반드시 선이 꺾이는 모서리에서부터 시작해야 해.\n\n**[공간 식별 및 기점(좌표) 추출 규칙 (매우 중요!)]**\n1. 공간 식별: 굵은 붉은선(마젠타선)으로 감싸인 영역 내부가 검은색 선(한 줄, 두 줄, 진한 줄 등)으로 구획되어 있다면, 각각을 독립된 '방'으로 취급해. ("송백실", "음악실" 등)\n2. 좌표 추출 원칙: 각 방을 완벽하게 감싸는 사각형 박스의 최소/최대 좌표(xMin, xMax, yMin, yMax)를 추출해. \n   - 이 좌표점들은 반드시 외곽 '붉은선' 또는 구획을 나누는 '검은선'이 꺾이거나 교차하는 모서리(Corner)를 정확히 가리켜야 해.\n   - 허공이 아니라, 반드시 그 **'선의 두께 정가운데(중심)'** 픽셀 위치를 0~100 백분율로 지정해.\n\n**[출력 요구사항]**\n식별된 모든 방에 대해 다음 데이터를 추출해:\n- roomName: 방 이름 (예: "송백실")\n- wText: 가로 길이 수치 (도면에 적힌 치수를 바탕으로 수학적으로 추정해, N/A 금지. 예: "W: 8.0m")\n- hText: 세로 길이 수치 (예: "H: 6.5m")\n- xMin: 방의 왼쪽 벽면 중심 X 좌표 (백분율)\n- xMax: 방의 오른쪽 벽면 중심 X 좌표 (백분율)\n- yMin: 방의 위쪽 벽면 중심 Y 좌표 (백분율)\n- yMax: 방의 아래쪽 벽면 중심 Y 좌표 (백분율)`,
            },
            {
              inlineData: {
                mimeType: imageMimeType || "image/jpeg",
                data: base64Data,
              },
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [
          {
            text: "너는 건축 CAD 도면 분석가야. 각 방의 이름을 식별하고, 사방 치수선을 그리기 위해 각 방을 완벽히 감싸는 사각형(Bounding Box)의 좌표(xMin, xMax, yMin, yMax)를 추출해. 이 좌표는 허공이 아니라 반드시 '붉은선이나 검은선이 꺾이는 모서리의 두께 정가운데 픽셀'이어야 해. 치수는 최대한 추정해서 N/A 없이 기입해. 응답은 JSON 형식이어야 해.",
          },
        ],
      },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            rooms: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  roomName: { type: "STRING" },
                  wText: { type: "STRING" },
                  hText: { type: "STRING" },
                  xMin: { type: "NUMBER" },
                  xMax: { type: "NUMBER" },
                  yMin: { type: "NUMBER" },
                  yMax: { type: "NUMBER" },
                },
                required: [
                  "roomName",
                  "wText",
                  "hText",
                  "xMin",
                  "xMax",
                  "yMin",
                  "yMax",
                ],
              },
            },
          },
          required: ["rooms"],
        },
      },
    };

    try {
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${finalApiKey}`;
      const listRes = await fetch(listUrl);

      if (!listRes.ok) {
        const err = await listRes.json().catch(() => ({}));
        throw new Error(
          `[상태 코드 ${listRes.status}] 구글 API 서버 접근 거부: ${err.error?.message || "권한 없음"}`,
        );
      }

      const listData = await listRes.json();
      const availableModels = listData.models?.map((m) => m.name) || [];

      let targetModel =
        availableModels.find((m) => m.includes("gemini-1.5-pro")) ||
        availableModels.find((m) => m.includes("gemini-1.5-flash")) ||
        availableModels.find((m) => m.includes("gemini-1.0-pro")) ||
        availableModels.find((m) => m.includes("gemini"));

      if (!targetModel) {
        throw new Error(
          `이 API 키로는 접근 가능한 Gemini 모델이 전혀 없습니다.`,
        );
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${finalApiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `[상태 코드 ${response.status}] 분석 중 서버 오류: ${errorData.error?.message || "알 수 없음"}`,
        );
      }

      const data = await response.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (responseText) {
        const parsedResult = JSON.parse(responseText);
        if (parsedResult.rooms && parsedResult.rooms.length > 0) {
          setAnalysisResult(parsedResult);
        }
        setIsProcessing(false);
      } else {
        throw new Error("결과를 찾을 수 없습니다.");
      }
    } catch (err) {
      setError(`🚨 AI 통신 에러: ${err.message}`);
      setIsProcessing(false);
    }
  };

  // 💡 [핵심 업데이트] AI가 찾은 방 모서리(정중앙)에서 치수 보조선이 완벽하게 맞물려 뻗어 나오도록 캔버스 그리기 로직 전면 수정
  useEffect(() => {
    if (!imageSrc || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      if (analysisResult && analysisResult.rooms) {
        const fontSize = Math.max(12, Math.floor(canvas.width * 0.012));

        analysisResult.rooms.forEach((room) => {
          // 좌표 오류(뒤집힘) 방지
          if (room.xMin >= room.xMax || room.yMin >= room.yMax) return;

          // AI가 찾은 붉은선/검은선 두께 정가운데의 꼭짓점 4개 좌표
          const pxXMin = (room.xMin / 100) * canvas.width;
          const pxXMax = (room.xMax / 100) * canvas.width;
          const pxYMin = (room.yMin / 100) * canvas.height;
          const pxYMax = (room.yMax / 100) * canvas.height;

          // 치수선을 그리는 함수 (정확한 꼭짓점 x1, y1, x2, y2에서 시작)
          const drawDimLine = (
            x1,
            y1,
            x2,
            y2,
            text,
            isHorizontal,
            position,
          ) => {
            const offset = Math.max(25, canvas.width * 0.025); // 선에서 얼마나 띄울지
            const overrun = 8; // 보조선이 메인 치수선을 넘어가는 길이
            const tick = 6; // 사선 틱 길이

            ctx.save();
            ctx.strokeStyle = "#2563eb";
            ctx.fillStyle = "#2563eb";
            ctx.lineWidth = Math.max(1.5, Math.floor(canvas.width * 0.0015));

            let dimLineX1 = x1,
              dimLineY1 = y1,
              dimLineX2 = x2,
              dimLineY2 = y2;
            let extStartX1 = x1,
              extStartY1 = y1; // 보조선 시작점 1 (무조건 도면 선 정중앙)
            let extStartX2 = x2,
              extStartY2 = y2; // 보조선 시작점 2 (무조건 도면 선 정중앙)
            let extEndX1 = x1,
              extEndY1 = y1; // 보조선 끝점 1
            let extEndX2 = x2,
              extEndY2 = y2; // 보조선 끝점 2

            // 방향(상하좌우)에 따른 덧셈/뺄셈 계산
            if (isHorizontal) {
              const dir = position === "top" ? -1 : 1; // top이면 위로(-), bottom이면 아래로(+)
              dimLineY1 = y1 + offset * dir;
              dimLineY2 = y2 + offset * dir;
              extEndY1 = dimLineY1 + overrun * dir;
              extEndY2 = dimLineY2 + overrun * dir;
            } else {
              const dir = position === "left" ? -1 : 1; // left면 왼쪽으로(-), right면 오른쪽으로(+)
              dimLineX1 = x1 + offset * dir;
              dimLineX2 = x2 + offset * dir;
              extEndX1 = dimLineX1 + overrun * dir;
              extEndX2 = dimLineX2 + overrun * dir;
            }

            // 1. 치수 보조선(연장선) 긋기: 붉은선 코너 한가운데서 시작해서 바깥으로 뻗어나감
            ctx.beginPath();
            ctx.moveTo(extStartX1, extStartY1);
            ctx.lineTo(extEndX1, extEndY1);
            ctx.moveTo(extStartX2, extStartY2);
            ctx.lineTo(extEndX2, extEndY2);
            ctx.stroke();

            // 2. 메인 치수선 긋기
            ctx.beginPath();
            ctx.moveTo(dimLineX1, dimLineY1);
            ctx.lineTo(dimLineX2, dimLineY2);
            ctx.stroke();

            // 3. 끝점 틱(사선) 긋기
            ctx.beginPath();
            if (isHorizontal) {
              ctx.moveTo(dimLineX1 - tick, dimLineY1 + tick);
              ctx.lineTo(dimLineX1 + tick, dimLineY1 - tick);
              ctx.moveTo(dimLineX2 - tick, dimLineY2 + tick);
              ctx.lineTo(dimLineX2 + tick, dimLineY2 - tick);
            } else {
              ctx.moveTo(dimLineX1 + tick, dimLineY1 - tick);
              ctx.lineTo(dimLineX1 - tick, dimLineY1 + tick);
              ctx.moveTo(dimLineX2 + tick, dimLineY2 - tick);
              ctx.lineTo(dimLineX2 - tick, dimLineY2 + tick);
            }
            ctx.lineWidth = Math.max(2.5, Math.floor(canvas.width * 0.0025));
            ctx.stroke();

            // 4. 수치 텍스트 작성 (가독성을 위한 하얀 배경)
            const cx = (dimLineX1 + dimLineX2) / 2;
            const cy = (dimLineY1 + dimLineY2) / 2;
            let textX = cx;
            let textY = cy;

            if (isHorizontal) {
              textY =
                position === "top"
                  ? dimLineY1 - fontSize * 0.8
                  : dimLineY1 + fontSize * 0.8;
            } else {
              textX =
                position === "left"
                  ? dimLineX1 - fontSize * 2.5
                  : dimLineX1 + fontSize * 2.5;
            }

            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const tw = ctx.measureText(text || "N/A").width;

            ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
            ctx.fillRect(
              textX - tw / 2 - 4,
              textY - fontSize / 2 - 4,
              tw + 8,
              fontSize + 8,
            );

            ctx.fillStyle = "#2563eb";
            ctx.fillText(text || "N/A", textX, textY);

            ctx.restore();
          };

          // 방을 완벽하게 감싸는 4개의 치수선 생성 (좌표가 완벽히 맞물림)
          drawDimLine(pxXMin, pxYMin, pxXMax, pxYMin, room.wText, true, "top"); // 윗면
          drawDimLine(
            pxXMin,
            pxYMax,
            pxXMax,
            pxYMax,
            room.wText,
            true,
            "bottom",
          ); // 아랫면
          drawDimLine(
            pxXMin,
            pxYMin,
            pxXMin,
            pxYMax,
            room.hText,
            false,
            "left",
          ); // 왼쪽면
          drawDimLine(
            pxXMax,
            pxYMin,
            pxXMax,
            pxYMax,
            room.hText,
            false,
            "right",
          ); // 오른쪽면

          // 방 이름 연하게 표시 (어느 방을 기준으로 그렸는지 식별)
          ctx.save();
          ctx.fillStyle = "rgba(220, 38, 38, 0.4)";
          ctx.font = `bold ${fontSize * 1.5}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            room.roomName || "",
            (pxXMin + pxXMax) / 2,
            (pxYMin + pxYMax) / 2,
          );
          ctx.restore();
        });
      }
    };
    img.src = imageSrc;
  }, [imageSrc, analysisResult]);

  const downloadImage = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = "평면도_정밀치수선_완성.png";
    link.href = dataUrl;
    link.click();
  };

  const isButtonDisabled = !imageSrc || isProcessing || analysisResult !== null;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans p-4 sm:p-8 flex justify-center items-start">
      <div className="w-full max-w-2xl bg-white rounded-3xl border border-zinc-200/60 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col min-h-[85vh]">
        <div className="px-8 pt-8 pb-2">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3 text-zinc-900">
            <Frame className="w-6 h-6 text-zinc-900" />
            방별 외곽 벽면 치수 계산기
          </h1>
          <p className="text-zinc-500 text-sm mt-2.5 font-medium leading-relaxed">
            구획된 방의 모서리(붉은선/검은선 정중앙)를 기점으로 치수 보조선이
            확장됩니다.
          </p>
        </div>

        <div className="px-8 pb-8 pt-4 flex flex-col gap-6 flex-1">
          <div className="flex flex-col gap-3">
            <label className="font-bold text-zinc-800 text-lg">
              1. 평면도 업로드
            </label>
            <label className="group border-2 border-dashed border-zinc-200 bg-zinc-50/50 hover:bg-zinc-50 hover:border-zinc-400 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-200">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <div className="flex gap-4 mb-4 text-zinc-400 group-hover:text-zinc-600 transition-colors duration-200">
                <Camera className="w-8 h-8" />
                <UploadCloud className="w-8 h-8" />
              </div>
              <span className="text-sm text-zinc-500 font-medium text-center">
                터치하여 사진 촬영 또는 갤러리에서 선택
              </span>
            </label>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm flex items-start gap-3 border border-red-100 whitespace-pre-line">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">{error}</p>
            </div>
          )}

          <button
            onClick={analyzeImage}
            disabled={isButtonDisabled}
            className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-200 ${
              isButtonDisabled
                ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                : "bg-zinc-900 text-white hover:bg-zinc-800 shadow-md hover:shadow-lg hover:-translate-y-0.5"
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                모서리 중앙점을 추적하여 완벽한 치수선을 그리는 중...
              </>
            ) : analysisResult ? (
              "✅ 계산 완료 (새 도면을 올리면 다시 활성화됩니다)"
            ) : (
              "2. 각 방별 외곽/구획 치수선 그리기"
            )}
          </button>

          <div className="flex flex-col gap-3 flex-1 mt-2">
            <h2 className="text-sm font-bold text-zinc-800 tracking-wide">
              결과 미리보기
            </h2>
            <div className="bg-zinc-50/80 rounded-2xl border border-zinc-200 overflow-hidden flex items-center justify-center flex-1 min-h-[300px]">
              {!imageSrc ? (
                <div className="text-zinc-400 flex flex-col items-center gap-3">
                  <ImageIcon className="w-8 h-8 opacity-50" />
                  <span className="text-sm font-medium">
                    이미지가 여기에 표시됩니다.
                  </span>
                </div>
              ) : (
                <div className="relative w-full p-2">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-auto block rounded-xl shadow-sm border border-zinc-100"
                  />
                </div>
              )}
            </div>
          </div>

          {analysisResult && (
            <button
              onClick={downloadImage}
              className="mt-1 w-full py-3.5 rounded-xl font-semibold text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-50 hover:border-zinc-400 flex items-center justify-center gap-2 transition-all duration-200"
            >
              <Download className="w-5 h-5" />
              결과 이미지 갤러리에 저장하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
