package com.celucanje.identity.repository;

import com.celucanje.identity.entity.Role;
import com.celucanje.identity.entity.RoleName;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoleRepository extends JpaRepository<Role, Long> {

    Optional<Role> findByName(RoleName name);
}