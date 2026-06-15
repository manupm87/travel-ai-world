import os


def create_structure():
    structure = {
        "app": {
            "__init__.py": "",
            "core": {
                "__init__.py": "",
                "config.py": "",
                "security.py": "",
                "exceptions.py": "",
                "database.py": "",
            },
            "models": {"__init__.py": "", "user.py": ""},
            "schemas": {"__init__.py": "", "user.py": ""},
            "repositories": {"__init__.py": "", "user.py": ""},
            "services": {"__init__.py": "", "user.py": ""},
            "api": {
                "__init__.py": "",
                "dependencies": {"__init__.py": "", "deps.py": ""},
                "v1": {
                    "__init__.py": "",
                    "endpoints": {"__init__.py": "", "user.py": ""},
                },
                "router.py": "",
            },
            "main.py": "",
        },
        "tests": {
            "__init__.py": "",
            "conftest.py": "",
            "api": {"__init__.py": "", "test_user.py": ""},
        },
        "requirements.txt": "fastapi[standard]\nsqlalchemy\npydantic_settings\npyjwt\npasslib[bcrypt]\npytest\n",
    }

    def create_nested(base_path, content):
        for name, value in content.items():
            path = os.path.join(base_path, name)
            if isinstance(value, dict):
                os.makedirs(path, exist_ok=True)
                create_nested(path, value)
            else:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(value)

    create_nested(".", structure)
    print("Project structure created successfully!")


if __name__ == "__main__":
    create_structure()
