import json
import requests
from mistralai import Mistral
import os
from dotenv import load_dotenv

load_dotenv()

CLAVE_API_LOSPRECIOS = os.getenv("CLAVE_API_LOSPRECIOS")
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
MODEL = "mistral-large-latest"

client = Mistral(api_key=MISTRAL_API_KEY)

def buscar_precios_por_producto(termino: str, clave_api: str, municipio_id: int = None) -> dict:
    url = "https://losprecios.co/buscar/resultado"
    params = {
        "ClaveAPI": clave_api,
        "Término": termino,
        "Tipo": "Ítem"
    }
    if municipio_id:
        params["MunicipioID"] = municipio_id
    response = requests.get(url, params=params)
    return response.json()

def buscar_precios(termino: str, municipio_id: int = None):
    return buscar_precios_por_producto(termino, CLAVE_API_LOSPRECIOS, municipio_id)

tool = {
    "name": "buscar_precios",
    "description": "Busca precios de productos en Colombia usando losprecios.co",
    "parameters": {
        "type": "object",
        "properties": {
            "termino": {"type": "string"},
            "municipio_id": {"type": "integer"}
        },
        "required": ["termino"]
    },
    "function": {
        "name": "buscar_precios",
        "parameters": {
            "type": "object",
            "properties": {
                "termino": {"type": "string"},
                "municipio_id": {"type": "integer"}
            },
            "required": ["termino"]
        }
    }
}

def mensaje_sistema():
    return {
        "role": "system",
        "content": (
            "Eres un asistente experto en precios de productos de supermercados. "
            "Cuando un usuario pregunte por el precio, debes extraer el nombre del producto y, "
            "si se menciona un municipio (por ejemplo, 'Bogotá', 'Medellín', 'Cali', 'Barranquilla'), "
            "convertir ese municipio en su ID correspondiente (Bogotá=1, Medellín=2, Cali=3, Barranquilla=4) y "
            "ejecutar la función 'buscar_precios' con esos parámetros."
        )
    }

def formatear_resultado(data: dict) -> str:
    if data.get("Resultado") != "Ok" or not data.get("Datos", {}).get("Ítems"):
        return "❌ No se encontraron resultados para tu búsqueda."

    respuesta = ""
    for item in data["Datos"]["Ítems"]:
        respuesta += f"\n🔹 {item['Producto']} - {item['Marca']} ({item['Tamaño']} {item['Unidad']})\n"
        if item.get("ÍtemsTiendas"):
            for tienda in item["ÍtemsTiendas"]:
                precio = f"${int(tienda['Precio']):,}".replace(",", ".")
                respuesta += f"   🛒 {tienda['Tienda']} ➜ {precio} COP [{tienda['Fecha']}]\n"
        else:
            respuesta += "   ⚠️ No hay precios disponibles para este ítem en el municipio seleccionado.\n"
    return respuesta

def chat():
    messages = [mensaje_sistema()]
    print("🤖 Chatbot iniciado. Escribe 'salir' para terminar.")

    while True:
        user_input = input("Tú: ")
        if user_input.lower() == "salir":
            print("👋 Chat finalizado.")
            break

        messages.append({
            "role": "user",
            "content": user_input
        })

        response = client.chat.complete(
            model=MODEL,
            messages=messages,
            tools=[tool]
        )

        choice = response.choices[0]
        tool_calls = getattr(choice.message, "tool_calls", None)

        # 👇 Agrega primero el mensaje del asistente con la función que quiere ejecutar
        messages.append({
            "role": "assistant",
            "content": choice.message.content or "",
            "tool_calls": [tc.model_dump() for tc in tool_calls] if tool_calls else []
        })

        if tool_calls:
            for tool_call in tool_calls:
                function_name = tool_call.function.name
                arguments = json.loads(tool_call.function.arguments or "{}")

                if function_name == "buscar_precios":
                    resultado = buscar_precios(**arguments)
                    contenido = formatear_resultado(resultado)

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": contenido+". Por favor, usa la información anterior y dime los precios del producto, si no, dame información general del producto que encuentres."
                    })

                    final_response = client.chat.complete(
                        model=MODEL,
                        messages=messages
                    )
                    final_message = final_response.choices[0].message.content or ""
                    print("Chatbot:", final_message)
                    messages.append({
                        "role": "assistant",
                        "content": final_message
                    })
        else:
            bot_message = choice.message.content or ""
            print("Chatbot:", bot_message)
            messages.append({
                "role": "assistant",
                "content": bot_message
            })

if __name__ == "__main__":
    chat()
