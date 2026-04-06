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
  const [dimensionData, setDimensionData] = useState(null);
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
      setDimensionData(null);
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
        `🚨 오류: API(Application Programming Interface - 프로그램 연결 통로) 키가 설정되지 않았습니다. 버셀(Vercel) 환경 변수를 다시 확인해 주세요.`,
      );
      setIsProcessing(false);
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    // [핵심 변경] AI에게 수학 계산을 시키지 않고, 오직 '면적 값(area)'과 '좌표 값(x, y, w, h)'만 뽑아오게 합니다!
    const payload = {
      contents: [
        {
          parts: [
            {
              text: `다음은 건축 평면도 이미지야. 너는 수학 계산을 하지 말고 정보만 추출해.\n\n**1단계 (면적 추출):** 도면 하단 표 등에서 붉은색 구역의 전체 면적(Area) 값(예: 29.69, 500.01 등)을 숫자만 정확히 찾아내어 'area' 값으로 출력해.\n\n**2단계 (경계 상자 - Bounding Box - 추출):** 붉은색 선들이 차지하는 가장 바깥쪽 테두리를 모두 감싸는 '하나의 거대한 직사각형 상자'를 이미지에서 식별해. 이 직사각형의 가장 왼쪽(x), 위쪽(y) 좌표와 가로 폭(w), 세로 높이(h)를 도면 크기 대비 백분율(0~100)로 정확히 추출해.`,
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
            text: "너는 도면에서 면적 값과 붉은색 외곽선이 차지하는 '전체 영역(Bounding Box - 경계 상자)'의 좌표만 추출하는 인공지능이야. 절대 네가 직접 수학적 역산(루트 등)을 하지 마. 오직 표에서 찾은 면적(area) 숫자와 시각적으로 확인한 경계 상자의 비율(x, y, w, h)만 JSON(JavaScript Object Notation - 자바스크립트 객체 표기법) 형식으로 출력해.",
          },
        ],
      },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            area: {
              type: "NUMBER",
              description: "도면 표에서 추출한 전체 면적 숫자 (예: 29.69)",
            },
            x: {
              type: "NUMBER",
              description: "붉은색 전체 영역의 가장 왼쪽 X 좌표 백분율 (0-100)",
            },
            y: {
              type: "NUMBER",
              description: "붉은색 전체 영역의 가장 위쪽 Y 좌표 백분율 (0-100)",
            },
            w: {
              type: "NUMBER",
              description: "붉은색 전체 영역의 가로 폭 백분율 (0-100)",
            },
            h: {
              type: "NUMBER",
              description: "붉은색 전체 영역의 세로 높이 백분율 (0-100)",
            },
          },
          required: ["area", "x", "y", "w", "h"],
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
          // 추출된 데이터 저장
          if (parsedResult.w && parsedResult.h && parsedResult.area) {
            setDimensionData(parsedResult);
          }
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

  useEffect(() => {
    if (!imageSrc || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      if (dimensionData) {
        const fontSize = Math.max(16, Math.floor(canvas.width * 0.015));
        const strokeWidth = Math.max(3, Math.floor(canvas.width * 0.003));

        // AI가 찾아낸 좌표를 화면의 픽셀(Pixel) 크기로 변환합니다.
        const left = (dimensionData.x / 100) * canvas.width;
        const top = (dimensionData.y / 100) * canvas.height;
        const pixelW = (dimensionData.w / 100) * canvas.width;
        const pixelH = (dimensionData.h / 100) * canvas.height;
        const right = left + pixelW;
        const bottom = top + pixelH;

        // =====================================================================
        // [핵심 해결 로직] 멍청한 AI 대신, 자바스크립트 코드가 완벽한 수학 계산을 수행합니다!
        // =====================================================================

        // 1. 화면에 보이는 픽셀을 통해 완벽한 시각적 비율(Ratio)을 측정합니다.
        const visualRatio = pixelW / pixelH;

        // 2. AI가 표에서 읽어온 진짜 면적(Area) 값 (예: 29.69)
        const area = dimensionData.area;

        // 3. 수학 공식 적용: 세로 길이 = 루트(면적 / 비율)
        const calculatedHeight = Math.sqrt(area / visualRatio);

        // 4. 수학 공식 적용: 가로 길이 = 세로 길이 * 비율
        const calculatedWidth = calculatedHeight * visualRatio;

        // 5. 소수점 첫째 자리까지만 텍스트로 예쁘게 자릅니다.
        const totalWidthText = calculatedWidth.toFixed(1);
        const totalHeightText = calculatedHeight.toFixed(1);

        const box = { left, top, right, bottom };

        // 오토캐드(AutoCAD) 스타일 치수선 그리기 함수
        const drawOverallDimension = (box, text, position) => {
          ctx.save();
          ctx.strokeStyle = "#2563eb";
          ctx.fillStyle = "#2563eb";
          ctx.lineWidth = strokeWidth;

          const offset = Math.max(50, canvas.width * 0.05); // 도면 바깥으로 빼줍니다.
          const gap = 10;
          const overrun = 15;
          const tickSize = 8;

          ctx.beginPath();

          if (position === "top" || position === "bottom") {
            const isTop = position === "top";
            const yLine = isTop ? box.top - offset : box.bottom + offset;
            const extStart = isTop ? box.top - gap : box.bottom + gap;
            const extEnd = isTop ? yLine - overrun : yLine + overrun;

            // 치수보조선
            ctx.moveTo(box.left, extStart);
            ctx.lineTo(box.left, extEnd);
            ctx.moveTo(box.right, extStart);
            ctx.lineTo(box.right, extEnd);
            ctx.stroke();

            // 치수선
            ctx.beginPath();
            ctx.moveTo(box.left, yLine);
            ctx.lineTo(box.right, yLine);
            ctx.stroke();

            // 까치발 (대각선 선)
            ctx.beginPath();
            ctx.moveTo(box.left - tickSize, yLine + tickSize);
            ctx.lineTo(box.left + tickSize, yLine - tickSize);
            ctx.moveTo(box.right - tickSize, yLine + tickSize);
            ctx.lineTo(box.right + tickSize, yLine - tickSize);
            ctx.stroke();

            // 텍스트
            ctx.textAlign = "center";
            ctx.textBaseline = isTop ? "bottom" : "top";
            ctx.font = `bold ${fontSize}px sans-serif`;
            const displayText = `Total W: ${text}m`;
            const tw = ctx.measureText(displayText).width;

            const textY = isTop ? yLine - 8 : yLine + 8;
            ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
            ctx.fillRect(
              box.left + (box.right - box.left) / 2 - tw / 2 - 6,
              isTop ? textY - fontSize - 2 : textY - 2,
              tw + 12,
              fontSize + 4,
            );

            ctx.fillStyle = "#1e3a8a";
            ctx.fillText(
              displayText,
              box.left + (box.right - box.left) / 2,
              textY,
            );
          } else if (position === "left" || position === "right") {
            const isLeft = position === "left";
            const xLine = isLeft ? box.left - offset : box.right + offset;
            const extStart = isLeft ? box.left - gap : box.right + gap;
            const extEnd = isLeft ? xLine - overrun : xLine + overrun;

            // 치수보조선
            ctx.moveTo(extStart, box.top);
            ctx.lineTo(extEnd, box.top);
            ctx.moveTo(extStart, box.bottom);
            ctx.lineTo(extEnd, box.bottom);
            ctx.stroke();

            // 치수선
            ctx.beginPath();
            ctx.moveTo(xLine, box.top);
            ctx.lineTo(xLine, box.bottom);
            ctx.stroke();

            // 까치발 (대각선 선)
            ctx.beginPath();
            ctx.moveTo(xLine - tickSize, box.top + tickSize);
            ctx.lineTo(xLine + tickSize, box.top - tickSize);
            ctx.moveTo(xLine - tickSize, box.bottom + tickSize);
            ctx.lineTo(xLine + tickSize, box.bottom - tickSize);
            ctx.stroke();

            // 텍스트
            ctx.textAlign = isLeft ? "right" : "left";
            ctx.textBaseline = "middle";
            ctx.font = `bold ${fontSize}px sans-serif`;
            const displayText = `Total H: ${text}m`;
            const tw = ctx.measureText(displayText).width;

            const textX = isLeft ? xLine - 10 : xLine + 10;
            ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
            ctx.fillRect(
              isLeft ? textX - tw - 6 : textX - 6,
              box.top + (box.bottom - box.top) / 2 - fontSize / 2 - 2,
              tw + 12,
              fontSize + 4,
            );

            ctx.fillStyle = "#1e3a8a";
            ctx.fillText(
              displayText,
              textX,
              box.top + (box.bottom - box.top) / 2,
            );
          }
          ctx.restore();
        };

        // 완벽하게 계산된 치수 텍스트(totalWidthText, totalHeightText)를 화면에 그립니다.
        drawOverallDimension(box, totalWidthText, "top");
        drawOverallDimension(box, totalWidthText, "bottom");
        drawOverallDimension(box, totalHeightText, "left");
        drawOverallDimension(box, totalHeightText, "right");
      }
    };
    img.src = imageSrc;
  }, [imageSrc, dimensionData]);

  const downloadImage = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = "평면도_완벽수치계산.png";
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
            면적 기반 수학적 역산 알고리즘 적용 완벽판
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
                정확한 수학 알고리즘으로 길이를 연산 중입니다...
              </>
            ) : (
              "완벽한 비율 치수 계산 및 그리기"
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

          {dimensionData && (
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
