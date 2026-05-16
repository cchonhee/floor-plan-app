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

    // 💡 [핵심] 대표님의 정확한 정의(붉은선+검은구획선+방이름)를 프롬프트에 완벽히 이식했습니다.
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `다음은 건축 평면도 이미지야. 다중 도면이 있다면 모두 독립적으로 분석해.\n\n**[앱의 핵심 목적: 방(공간) 식별 및 사방 외곽 벽면 치수 표시]**\n이 도면에서 사람들이 사용하는 '방(공간)'을 정확히 식별하고, 각 방을 둘러싸고 있는 '4개의 면(상, 하, 좌, 우)'의 길이를 모두 측정해야 해.\n\n**[공간/방 식별 규칙 (매우 중요)]**\n1. 기본 영역: '굵은 붉은색(또는 마젠타색) 선'으로 감싸여 있고, 그 내부에 '가는 붉은색(또는 마젠타색) 가로 직선'이 여러 개 채워져 있는 곳이 사람들이 사용하는 기본 공간이야.\n2. 내부 구획: 이 큰 공간 내부가 '검은색 선(한 줄, 두 줄, 또는 진한 줄)'으로 구획되어 나뉘어 있다면, 나뉜 각각의 구역을 독립된 별개의 '방'으로 취급해.\n3. 방 이름: 이렇게 나뉜 각 공간/방 안에는 해당 방이 무엇인지 알려주는 이름(예: "송백실", "음악실", "계획실" 등)이 텍스트로 적혀 있어.\n\n**[치수 표시 대상]**\n각각의 방("송백실", "음악실" 등)을 식별했다면, 해당 방을 둘러싼 '사방의 길이'를 모두 파악해야 해. 그 사방의 테두리 선이 도면 바깥쪽의 '굵은 붉은선/마젠타선'이든, 방과 방을 나누는 내부의 '검은색 구획선'이든 상관없이 해당 방 전체가 차지하는 직사각형 영역(Bounding Box)의 좌표를 백분율로 추출해.\n\n**[출력 요구사항]**\n식별된 모든 방에 대해 다음을 추출해:\n- roomName: 방 이름 (예: "송백실")\n- wText: 실제 가로 길이 추정치 (숫자만 쓰지 말고 "7.5m" 형태로)\n- hText: 실제 세로 길이 추정치 (숫자만 쓰지 말고 "6.5m" 형태로)\n- xMin: 방 영역의 가장 왼쪽 X 좌표 (이미지 너비 대비 0~100 백분율)\n- xMax: 방 영역의 가장 오른쪽 X 좌표 (이미지 너비 대비 0~100 백분율)\n- yMin: 방 영역의 가장 위쪽 Y 좌표 (이미지 높이 대비 0~100 백분율)\n- yMax: 방 영역의 가장 아래쪽 Y 좌표 (이미지 높이 대비 0~100 백분율)`,
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
            text: "너는 건축 CAD 도면 분석가야. 붉은색 외부 외곽선과 검은색 내부 구획선으로 나뉜 각 방(공간)을 이름과 함께 정확히 개별 식별해. 각 방을 둘러싼 사방(4면)의 치수선을 그리기 위해, 해당 방이 차지하는 기하학적 영역(Bounding Box)의 최소/최대 좌표(x,y)를 백분율(0-100)로 반환해. 응답은 JSON(JavaScript Object Notation) 형식이어야 해.",
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
      // 모델 자동 탐색 (버그 및 권한 차단 방지용)
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

  // 💡 [개편] 파란색 치수선을 '사방(위,아래,좌,우)'에 그리는 로직으로 완벽 복구 및 업그레이드
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
          // 좌표 오류 방지
          if (room.xMin >= room.xMax || room.yMin >= room.yMax) return;

          // AI가 인식한 방의 4면 모서리 좌표 변환
          const pxX1 = (room.xMin / 100) * canvas.width;
          const pxX2 = (room.xMax / 100) * canvas.width;
          const pxY1 = (room.yMin / 100) * canvas.height;
          const pxY2 = (room.yMax / 100) * canvas.height;

          const wText = `W: ${room.wText}`;
          const hText = `H: ${room.hText}`;

          // 치수선을 그리는 공통 함수 (하루 전 스타일)
          const drawDimLine = (
            x1,
            y1,
            x2,
            y2,
            text,
            isHorizontal,
            position,
          ) => {
            const cx = (x1 + x2) / 2;
            const cy = (y1 + y2) / 2;
            const offset = Math.max(15, canvas.width * 0.015); // 방 테두리에서 띄우는 거리
            const tick = 6;
            const gap = 2;

            ctx.save();
            ctx.strokeStyle = "#2563eb"; // 파란색 선
            ctx.fillStyle = "#2563eb"; // 파란색 글씨
            ctx.lineWidth = Math.max(1.5, Math.floor(canvas.width * 0.0015));

            let lineX1 = x1,
              lineY1 = y1,
              lineX2 = x2,
              lineY2 = y2;
            let extStartX1 = x1,
              extStartY1 = y1,
              extStartX2 = x2,
              extStartY2 = y2;

            // 치수선 띄우는 위치 계산
            if (isHorizontal) {
              lineY1 = lineY2 = position === "top" ? y1 - offset : y1 + offset;
              extStartY1 = position === "top" ? y1 - gap : y1 + gap;
              extStartY2 = position === "top" ? y2 - gap : y2 + gap;
            } else {
              lineX1 = lineX2 = position === "left" ? x1 - offset : x1 + offset;
              extStartX1 = position === "left" ? x1 - gap : x1 + gap;
              extStartX2 = position === "left" ? x2 - gap : x2 + gap;
            }

            // 1. 메인 치수선 긋기
            ctx.beginPath();
            ctx.moveTo(lineX1, lineY1);
            ctx.lineTo(lineX2, lineY2);
            ctx.stroke();

            // 2. 보조선(연장선) 긋기
            ctx.beginPath();
            ctx.moveTo(extStartX1, extStartY1);
            ctx.lineTo(lineX1, lineY1);
            ctx.moveTo(extStartX2, extStartY2);
            ctx.lineTo(lineX2, lineY2);
            ctx.setLineDash([3, 3]); // 점선 효과 약간 추가
            ctx.stroke();
            ctx.setLineDash([]); // 원상 복구

            // 3. 끝점 틱(사선) 긋기
            ctx.beginPath();
            if (isHorizontal) {
              ctx.moveTo(lineX1 - tick, lineY1 + tick);
              ctx.lineTo(lineX1 + tick, lineY1 - tick);
              ctx.moveTo(lineX2 - tick, lineY2 + tick);
              ctx.lineTo(lineX2 + tick, lineY2 - tick);
            } else {
              ctx.moveTo(lineX1 + tick, lineY1 - tick);
              ctx.lineTo(lineX1 - tick, lineY1 + tick);
              ctx.moveTo(lineX2 + tick, lineY2 - tick);
              ctx.lineTo(lineX2 - tick, lineY2 + tick);
            }
            ctx.lineWidth = Math.max(2, Math.floor(canvas.width * 0.002)); // 틱은 약간 더 두껍게
            ctx.stroke();

            // 4. 수치 텍스트 작성 (글씨 뒤에 하얀 배경 깔기)
            let textX = cx;
            let textY = cy;
            if (isHorizontal) {
              textY =
                position === "top"
                  ? lineY1 - fontSize * 0.8
                  : lineY1 + fontSize * 0.8;
            } else {
              textX =
                position === "left"
                  ? lineX1 - fontSize * 2.2
                  : lineX1 + fontSize * 2.2;
            }

            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const tw = ctx.measureText(text).width;

            ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
            ctx.fillRect(
              textX - tw / 2 - 4,
              textY - fontSize / 2 - 4,
              tw + 8,
              fontSize + 8,
            );

            ctx.fillStyle = "#2563eb";
            ctx.fillText(text, textX, textY);

            ctx.restore();
          };

          // 방 하나당 '사방(4면)'에 모두 치수선을 그립니다!
          drawDimLine(pxX1, pxY1, pxX2, pxY1, wText, true, "top"); // 윗면
          drawDimLine(pxX1, pxY2, pxX2, pxY2, wText, true, "bottom"); // 아랫면
          drawDimLine(pxX1, pxY1, pxX1, pxY2, hText, false, "left"); // 왼쪽면
          drawDimLine(pxX2, pxY1, pxX2, pxY2, hText, false, "right"); // 오른쪽면

          // 확인용: 어떤 방을 측정한 것인지 방 한가운데에 연한 빨간색으로 방 이름 표시
          ctx.save();
          ctx.fillStyle = "rgba(220, 38, 38, 0.4)";
          ctx.font = `bold ${fontSize * 1.5}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(room.roomName, (pxX1 + pxX2) / 2, (pxY1 + pxY2) / 2);
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
    link.download = "평면도_사방치수선_완성.png";
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
            방을 구분하는 구획선(검은선)과 외곽선(붉은선)을 파악하여 사방에
            치수선을 그립니다.
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
                <Loader2 className="w-5 h-5 animate-spin" />각 방의 구획을
                파악하고 사방의 치수선을 그리는 중...
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
