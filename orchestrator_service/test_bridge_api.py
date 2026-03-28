import httpx
import asyncio
import os

BRIDGE_TOKEN = os.getenv("BRIDGE_API_TOKEN", "super-secret-bridge-token-2026")
API_URL = "http://localhost:8001/api/bridge/v1/leads"

async def test_auth():
    print("Test 1: Sin Token (Debe devolver 401)")
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{API_URL}?min_score=5.0")
        print(f"Status Code: {resp.status_code}")
        assert resp.status_code == 401
        
    print("\nTest 2: Con Token Inválido (Debe devolver 401)")
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{API_URL}?min_score=5.0", headers={"X-Bridge-Token": "bad-token"})
        print(f"Status Code: {resp.status_code}")
        assert resp.status_code == 401
        
    print("\nTest 3: Con Token Válido (Debe devolver 200 o 500 si la BD no está up, pero autorizará)")
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{API_URL}?min_score=5.0", headers={"X-Bridge-Token": BRIDGE_TOKEN})
        print(f"Status Code: {resp.status_code}")
        # Not checking for exact 200 because DB might be down in the test environment, but it should not be 401.
        assert resp.status_code != 401
        if resp.status_code == 200:
            print("Response:", resp.json())
        else:
            print("Response:", resp.text)
            
    print("\n✅ Todos los tests de conectividad a la Bridge API pasaron exitosamente.")

if __name__ == "__main__":
    asyncio.run(test_auth())
