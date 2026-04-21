from mcp.server import FastMCP
mcp = FastMCP('demo')

@mcp.tool()
def list_users() -> list:
    """List all users."""
    return []

@mcp.tool()
def get_user(user_id: int):
    """Fetch a user by id."""
    return None

@mcp.tool()
def no_docstring():
    return 42
