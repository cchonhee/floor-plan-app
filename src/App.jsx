import React, { useState, useRef, useEffect } from "react";
import {
  Image as ImageIcon,
  Download,
  AlertCircle,
  Loader2,
  Camera,
  UploadCloud,
  Sparkles,
} from "lucide-react";

export default function App() {
  const [imageSrc, setImageSrc] = useState(null);
  const [base64Data, setBase64Data] = useState(null);
  const [imageMimeType, setImageMimeType] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [segments, setSegments] = useState([]);
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
      setSegments([]);
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

    let apiKey = "";
    const modelName = "gemini-2.5-flash";

    try {
      if (
        typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_GEMINI_API_KEY
      ) {
        apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      }
    } catch (e) {
      console.warn("환경 변수를 불러오지 못했습니다.", e);
    }

    if (!apiKey || apiKey.trim() === "") {
      setError(
        `🚨 오류: API 키가 설정되지 않았습니다. Vercel 환경 변수를 다시 확인해 주세요.`,
      );
      setIsProcessing(false);
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    // [핵심 변경] 연한 선 무시, 진한 붉은색 외곽선(다각형 테두리)의 각 선분만 찾도록 명령!
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `다음은 건축 평면도 이미지야. 매우 정밀한 시각적 분석과 수학적 계산이 필요해.\n\n**1단계 (절대 기준 설정):** 도면 하단의 표를 보면 특정 구역(탐구실 등 전체)의 면적이 **"500.01 ㎡"** (또는 도면에 적힌 다른 전체 면적 값)라고 명시되어 있어. 이 전체 면적을 모든 길이를 역산하는 유일한 척도(Scale)로 삼아.\n\n**2단계 (진한 붉은색 외곽선 추적 - 가장 중요!):** 도면 안쪽에 있는 연한 붉은색 가로/세로 격자선들이나 개별 방 이름은 **완전히 무시해!** 오직 도면 전체를 크게 감싸고 있는 **"가장 굵고 진한 붉은색 테두리 선(외곽 다각형)"**만 찾아내. \n\n**3단계 (외곽선 분할 및 좌표 추출):** 그 굵은 붉은색 다각형을 여러 개의 꺾이는 '직선 구간(선분)'들로 쪼개. 각 직선 구간의 시작점(x1, y1)과 끝점(x2, y2) 좌표를 백분율(0~100)로 추출해.\n\n**4단계 (길이 계산 및 방향):** 1단계의 전체 면적(예: 500.01㎡) 대비 픽셀 길이를 바탕으로, 각 붉은색 직선 구간의 실제 길이를 미터(m) 단위 소수점 첫째 자리까지 역산해(예: 17.8). 그리고 이 선분이 도면 중심을 기준으로 바깥쪽으로 어느 방향에 있는지(top, bottom, left, right) 판단해줘. 치수선을 그릴 방향을 정하기 위함이야.`,
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
            text: "너는 건축 도면의 굵은 테두리(외곽선)만 추적하여 치수를 계산하는 AI야. 내부의 연한 선이나 개별 방은 무시해. 굵은 붉은 선의 각 직선 구간(Segment)들의 시작/끝 좌표와 역산된 길이를 JSON 배열(Array) 형식으로 출력해. 방향(orientation)은 'horizontal' 또는 'vertical'로, 위치(position)는 치수선을 도면 바깥쪽으로 빼기 위해 도형 중심 기준 바깥 방향('top', 'bottom', 'left', 'right')으로 명시해.",
          },
        ],
      },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            segments: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  lengthText: {
                    type: "STRING",
                    description: "역산된 길이 숫자만 (예: 17.8)",
                  },
                  orientation: {
                    type: "STRING",
                    description: "선의 방향: 'horizontal' 또는 'vertical'",
                  },
                  position: {
                    type: "STRING",
                    description:
                      "도형 밖으로 치수선을 뺄 방향: 'top', 'bottom', 'left', 'right'",
                  },
                  x1: {
                    type: "NUMBER",
                    description: "선분의 시작 X 좌표 백분율 (0-100)",
                  },
                  y1: {
                    type: "NUMBER",
                    description: "선분의 시작 Y 좌표 백분율 (0-100)",
                  },
                  x2: {
                    type: "NUMBER",
                    description: "선분의 끝 X 좌표 백분율 (0-100)",
                  },
                  y2: {
                    type: "NUMBER",
                    description: "선분의 끝 Y 좌표 백분율 (0-100)",
                  },
                },
                required: [
                  "lengthText",
                  "orientation",
                  "position",
                  "x1",
                  "y1",
                  "x2",
                  "y2",
                ],
              },
            },
          },
          required: ["segments"],
        },
      },
    };

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const delays = [1000, 2000, 4000, 8000, 16000];

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`상태 코드: ${response.status}`);
        }

        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (responseText) {
          const parsedResult = JSON.parse(responseText);
          setSegments(parsedResult.segments || []);
          setIsProcessing(false);
          return;
        } else {
          throw new Error("결과를 찾을 수 없습니다.");
        }
      } catch (err) {
        if (attempt === delays.length) {
          setError(
            "오류가 발생했습니다. 잠시 후 다시 시도해주세요. " + err.message,
          );
          setIsProcessing(false);
          return;
        }
        await sleep(delays[attempt]);
      }
    }
  };

  // [핵심 변경 2] 각 외곽선 '선분(Segment)'을 바탕으로 바깥쪽으로 치수선 뻗어 나가게 그리기
  useEffect(() => {
    if (!imageSrc || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      if (segments && segments.length > 0) {
        const fontSize = Math.max(14, Math.floor(canvas.width * 0.012));
        const strokeWidth = Math.max(2, Math.floor(canvas.width * 0.002));

        // 치수선 그리기 함수 (선분 기반 AutoCAD 스타일)
        const drawSegmentDimension = (segment) => {
          ctx.save();
          ctx.strokeStyle = "#2563eb"; // 선명한 파란색
          ctx.fillStyle = "#2563eb";
          ctx.lineWidth = strokeWidth;

          // 백분율 좌표를 픽셀로 변환
          let startX = (segment.x1 / 100) * canvas.width;
          let startY = (segment.y1 / 100) * canvas.height;
          let endX = (segment.x2 / 100) * canvas.width;
          let endY = (segment.y2 / 100) * canvas.height;

          // 좌표 정렬 (항상 왼쪽에서 오른쪽, 위에서 아래 방향으로 보정)
          if (startX > endX) {
            let temp = startX;
            startX = endX;
            endX = temp;
          }
          if (startY > endY) {
            let temp = startY;
            startY = endY;
            endY = temp;
          }

          const offset = Math.max(40, canvas.width * 0.04); // 치수선을 선에서 얼마나 띄울지 (바깥쪽으로)
          const gap = 5; // 선과 치수보조선 사이 틈
          const overrun = 10; // 꼬리 길이
          const tickSize = 6; // 대각선 틱 크기

          ctx.beginPath();

          if (segment.orientation === "horizontal") {
            const y = (startY + endY) / 2; // 평균 Y값 사용 (수평 보정)
            const isTop = segment.position === "top";

            // 위치가 top이면 위쪽(-), bottom이면 아래쪽(+)으로 치수선을 뺍니다.
            const direction = isTop ? -1 : 1;
            const yLine = y + offset * direction;
            const extStart = y + gap * direction;
            const extEnd = yLine + overrun * direction;

            // 1. 치수보조선 (세로)
            ctx.moveTo(startX, extStart);
            ctx.lineTo(startX, extEnd);
            ctx.moveTo(endX, extStart);
            ctx.lineTo(endX, extEnd);
            ctx.stroke();

            // 2. 치수선 (가로)
            ctx.beginPath();
            ctx.moveTo(startX, yLine);
            ctx.lineTo(endX, yLine);
            ctx.stroke();

            // 3. 까치발
            ctx.beginPath();
            ctx.moveTo(startX - tickSize, yLine + tickSize);
            ctx.lineTo(startX + tickSize, yLine - tickSize);
            ctx.moveTo(endX - tickSize, yLine + tickSize);
            ctx.lineTo(endX + tickSize, yLine - tickSize);
            ctx.stroke();

            // 4. 텍스트
            ctx.textAlign = "center";
            ctx.textBaseline = isTop ? "bottom" : "top"; // 선 위치에 따라 텍스트 위/아래 결정
            ctx.font = `bold ${fontSize}px sans-serif`;
            const text = segment.lengthText + "m";
            const tw = ctx.measureText(text).width;

            const textY = isTop ? yLine - 4 : yLine + 4;

            ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
            ctx.fillRect(
              startX + (endX - startX) / 2 - tw / 2 - 4,
              isTop ? textY - fontSize : textY,
              tw + 8,
              fontSize,
            );

            ctx.fillStyle = "#1e3a8a";
            ctx.fillText(text, startX + (endX - startX) / 2, textY);
          } else if (segment.orientation === "vertical") {
            const x = (startX + endX) / 2; // 평균 X값 사용 (수직 보정)
            const isLeft = segment.position === "left";

            // 위치가 left면 왼쪽(-), right면 오른쪽(+)으로 치수선을 뺍니다.
            const direction = isLeft ? -1 : 1;
            const xLine = x + offset * direction;
            const extStart = x + gap * direction;
            const extEnd = xLine + overrun * direction;

            // 1. 치수보조선 (가로)
            ctx.moveTo(extStart, startY);
            ctx.lineTo(extEnd, startY);
            ctx.moveTo(extStart, endY);
            ctx.lineTo(extEnd, endY);
            ctx.stroke();

            // 2. 치수선 (세로)
            ctx.beginPath();
            ctx.moveTo(xLine, startY);
            ctx.lineTo(xLine, endY);
            ctx.stroke();

            // 3. 까치발
            ctx.beginPath();
            ctx.moveTo(xLine - tickSize, startY + tickSize);
            ctx.lineTo(xLine + tickSize, startY - tickSize);
            ctx.moveTo(xLine - tickSize, endY + tickSize);
            ctx.lineTo(xLine + tickSize, endY - tickSize);
            ctx.stroke();

            // 4. 텍스트 (정방향으로 읽기 쉽게)
            ctx.textAlign = isLeft ? "right" : "left";
            ctx.textBaseline = "middle";
            ctx.font = `bold ${fontSize}px sans-serif`;
            const text = segment.lengthText + "m";
            const tw = ctx.measureText(text).width;

            const textX = isLeft ? xLine - 6 : xLine + 6;

            ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
            ctx.fillRect(
              isLeft ? textX - tw - 4 : textX - 4,
              startY + (endY - startY) / 2 - fontSize / 2,
              tw + 8,
              fontSize,
            );

            ctx.fillStyle = "#1e3a8a";
            ctx.fillText(text, textX, startY + (endY - startY) / 2);
          }
          ctx.restore();
        };

        segments.forEach((segment) => {
          if (segment.lengthText) {
            drawSegmentDimension(segment);
          }
        });
      }
    };
    img.src = imageSrc;
  }, [imageSrc, segments]);

  const downloadImage = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = "평면도_외곽치수완성.png";
    link.href = dataUrl;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans p-4 sm:p-6 flex justify-center items-start">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col min-h-[90vh]">
        <div className="bg-linear-to-r from-indigo-600 to-blue-500 p-6 text-white">
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-indigo-200" />
            도면 수치 자동 입력기
          </h1>
          <p className="text-indigo-100 text-sm mt-2 font-medium opacity-90">
            외곽선(진한 붉은선) 추출 및 면적 기반 역산 표기
          </p>
        </div>

        <div className="p-6 flex flex-col gap-6 flex-1">
          <div className="flex flex-col gap-3">
            <label className="font-bold text-slate-700 text-lg">
              1. 평면도 업로드
            </label>
            <label className="group border-2 border-dashed border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-300">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <div className="flex gap-4 mb-3 text-indigo-400 group-hover:text-indigo-600 transition-colors duration-300">
                <Camera className="w-10 h-10" />
                <UploadCloud className="w-10 h-10" />
              </div>
              <span className="text-sm text-slate-500 font-semibold text-center">
                터치하여 사진 촬영
                <br />
                또는 갤러리에서 선택
              </span>
            </label>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm flex items-start gap-3 border border-red-100">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <button
            onClick={analyzeImage}
            disabled={!imageSrc || isProcessing}
            className={`w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all duration-300 shadow-lg ${
              !imageSrc || isProcessing
                ? "bg-slate-300 shadow-none cursor-not-allowed text-slate-500"
                : "bg-linear-to-r from-indigo-600 to-blue-500 hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:translate-y-0"
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                외곽선을 추적하고 수치를 역산 중입니다...
              </>
            ) : (
              "외곽선 치수 계산 및 그리기"
            )}
          </button>

          <div className="flex flex-col gap-3 flex-1">
            <label className="font-bold text-slate-700 text-lg">
              결과 미리보기
            </label>
            <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden flex items-center justify-center flex-1 min-h-[250px]">
              {!imageSrc ? (
                <div className="text-slate-400 flex flex-col items-center gap-3">
                  <ImageIcon className="w-10 h-10 opacity-50" />
                  <span className="text-sm font-medium">
                    이미지를 업로드하면 표시됩니다.
                  </span>
                </div>
              ) : (
                <div className="relative w-full p-2">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-auto block rounded-xl shadow-sm"
                  />
                </div>
              )}
            </div>
          </div>

          {segments.length > 0 && (
            <button
              onClick={downloadImage}
              className="mt-2 w-full py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors duration-300 shadow-md"
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
